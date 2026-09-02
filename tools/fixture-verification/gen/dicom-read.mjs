// Just enough DICOM to pull frames out of the viewer-testdata corpus for
// generate-jpegxl-fixtures.mjs: file meta, the top level of the data set, and
// either native or encapsulated PixelData.
//
// Deliberately not a DICOM library. It reads explicit and implicit VR little
// endian, skips sequences wholesale, and ignores character sets, because that
// is all the two source series need. Nothing in packages/ depends on it.
import { readFileSync } from "node:fs";

// VRs whose explicit-VR header carries a 32-bit length after two reserved
// bytes, rather than the usual 16-bit length (PS3.5 7.1.2).
const LONG_FORM_VRS = new Set(["OB", "OW", "OF", "OD", "OL", "SQ", "UT", "UN", "UC", "UR"]);

const IMPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2";
const PIXEL_DATA = "7fe00010";
const ITEM = 0xe000;
const SEQUENCE_DELIMITER = 0xe0dd;
const UNDEFINED_LENGTH = 0xffffffff;

const tagOf = (group, element) =>
  group.toString(16).padStart(4, "0") + element.toString(16).padStart(4, "0");

/** Reads the group-0002 file meta group, which is always explicit VR LE. */
function readFileMeta(buf) {
  if (buf.toString("latin1", 128, 132) !== "DICM") {
    throw new Error("not a part-10 DICOM file (no DICM magic)");
  }

  const meta = {};
  let pos = 132;
  while (pos + 8 <= buf.length) {
    const group = buf.readUInt16LE(pos);
    if (group !== 0x0002) break;

    const element = buf.readUInt16LE(pos + 2);
    const vr = buf.toString("latin1", pos + 4, pos + 6);
    const longForm = LONG_FORM_VRS.has(vr);
    const length = longForm ? buf.readUInt32LE(pos + 8) : buf.readUInt16LE(pos + 6);
    const headerLength = longForm ? 12 : 8;

    meta[tagOf(group, element)] = buf
      .toString("latin1", pos + headerLength, pos + headerLength + length)
      .replace(/\0+$/, "")
      .trim();
    pos += headerLength + length;
  }
  return { meta, datasetStart: pos };
}

/** Skips an undefined-length sequence, returning the offset just past it. */
function skipUndefinedLengthSequence(buf, start) {
  let pos = start;
  let depth = 1;
  while (pos + 8 <= buf.length && depth > 0) {
    const group = buf.readUInt16LE(pos);
    const element = buf.readUInt16LE(pos + 2);
    const length = buf.readUInt32LE(pos + 4);
    pos += 8;
    if (group === 0xfffe && element === SEQUENCE_DELIMITER) depth -= 1;
    else if (group === 0xfffe && element === ITEM && length !== UNDEFINED_LENGTH) pos += length;
  }
  return pos;
}

/** Walks the top level of the data set, stopping at PixelData. */
function readDataset(buf, start, explicitVr) {
  const elements = {};
  let pos = start;

  while (pos + 8 <= buf.length) {
    const group = buf.readUInt16LE(pos);
    const element = buf.readUInt16LE(pos + 2);

    let vr = null;
    let length;
    let headerLength;
    if (explicitVr) {
      vr = buf.toString("latin1", pos + 4, pos + 6);
      const longForm = LONG_FORM_VRS.has(vr);
      length = longForm ? buf.readUInt32LE(pos + 8) : buf.readUInt16LE(pos + 6);
      headerLength = longForm ? 12 : 8;
    } else {
      length = buf.readUInt32LE(pos + 4);
      headerLength = 8;
    }

    const tag = tagOf(group, element);
    if (tag === PIXEL_DATA) {
      return { elements, pixelStart: pos + headerLength, pixelLen: length };
    }

    if (length === UNDEFINED_LENGTH) {
      pos = skipUndefinedLengthSequence(buf, pos + headerLength);
      continue;
    }

    elements[tag] = { vr, offset: pos + headerLength, length };
    pos += headerLength + length;
  }

  return { elements, pixelStart: -1, pixelLen: 0 };
}

/**
 * Parses one DICOM file.
 *
 * @returns the attributes the fixture generator needs, plus `buf`,
 *   `pixelStart` and `pixelLen` describing where PixelData sits in it.
 */
export function parse(file) {
  const buf = readFileSync(file);
  const { meta, datasetStart } = readFileMeta(buf);
  const transferSyntaxUid = meta["00020010"];
  const { elements, pixelStart, pixelLen } = readDataset(
    buf,
    datasetStart,
    transferSyntaxUid !== IMPLICIT_VR_LITTLE_ENDIAN
  );

  const text = (tag) => {
    const el = elements[tag];
    if (!el) return undefined;
    return buf
      .toString("latin1", el.offset, el.offset + el.length)
      .replace(/\0+$/, "")
      .trim();
  };
  const uint16 = (tag) => (elements[tag] ? buf.readUInt16LE(elements[tag].offset) : undefined);
  const integer = (tag) => {
    const value = text(tag);
    return value === undefined ? undefined : Number.parseInt(value, 10);
  };

  return {
    buf,
    transferSyntaxUid,
    sopClassUid: meta["00020002"],
    sopInstanceUid: meta["00020003"],
    modality: text("00080060"),
    seriesInstanceUid: text("0020000e"),
    instanceNumber: integer("00200013"),
    rows: uint16("00280010"),
    columns: uint16("00280011"),
    samplesPerPixel: uint16("00280002"),
    photometricInterpretation: text("00280004"),
    planarConfiguration: uint16("00280006"),
    numberOfFrames: integer("00280008") || 1,
    bitsAllocated: uint16("00280100"),
    bitsStored: uint16("00280101"),
    pixelRepresentation: uint16("00280103"),
    pixelStart,
    pixelLen,
  };
}

/**
 * Splits encapsulated PixelData into one buffer per fragment, dropping the
 * basic offset table. The source series store exactly one fragment per frame.
 */
export function fragments(dataset) {
  const { buf } = dataset;
  const items = [];
  let pos = dataset.pixelStart;

  while (pos + 8 <= buf.length) {
    const group = buf.readUInt16LE(pos);
    const element = buf.readUInt16LE(pos + 2);
    const length = buf.readUInt32LE(pos + 4);
    pos += 8;
    if (group !== 0xfffe || element !== ITEM) break;
    items.push(buf.subarray(pos, pos + length));
    pos += length;
  }

  return items.slice(1);
}
