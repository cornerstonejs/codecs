// Builds a JP2 (box-wrapped) file around a bare J2K codestream.
//
// Why this is generated rather than committed as a fixture: the point of the
// JP2 wrapper here is to make openjpeg delegate a skip to our own
// opj_skip_from_buffer callback in BufferStream.hpp, and that only happens for
// a skip LARGER than the stream's internal buffer. opj_stream_read_data always
// refills a full OPJ_J2K_STREAM_CHUNK_SIZE (1MB) chunk, and
// opj_stream_read_skip serves anything within m_bytes_in_buffer directly, so
// the skipped box has to be over 1MB. That makes the file too big to want in
// git, and it is trivially reproducible from a codestream we already ship.
//
// Run directly to write one out, e.g. to hand to a bug report:
//   node test/helpers/jp2.mjs test/fixtures/j2k/CT1.j2k /tmp/CT1-boxed.jp2

import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

// opj_stream_default_create's buffer size (openjpeg.h OPJ_J2K_STREAM_CHUNK_SIZE).
export const STREAM_CHUNK_SIZE = 0x100000

// Comfortably over one chunk, so the skip cannot be served from the buffer no
// matter how much of it the header reads happen to have consumed.
export const DEFAULT_FILLER_BYTES = STREAM_CHUNK_SIZE + 4096

function box(type, ...contents) {
  const content = Buffer.concat(contents)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(content.length + 8, 0)
  header.write(type, 4, 4, "ascii")
  return Buffer.concat([header, content])
}

function u32(value) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(value, 0)
  return b
}

function u16(value) {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(value, 0)
  return b
}

/**
 * Reads the SIZ marker segment of a raw J2K codestream, so the JP2 image
 * header we synthesise describes the codestream it actually wraps.
 */
export function parseSiz(codestream) {
  if (codestream.readUInt16BE(0) !== 0xff4f || codestream.readUInt16BE(2) !== 0xff51) {
    throw new Error("not a raw J2K codestream (expected SOC then SIZ)")
  }

  const xsiz = codestream.readUInt32BE(8)
  const ysiz = codestream.readUInt32BE(12)
  const xosiz = codestream.readUInt32BE(16)
  const yosiz = codestream.readUInt32BE(20)
  const numComponents = codestream.readUInt16BE(40)

  // Ssiz is (bitdepth - 1) with the top bit set when signed — the same
  // encoding JP2's ihdr BPC field uses, so it can be copied across verbatim.
  const ssiz = codestream.readUInt8(42)

  return {
    width: xsiz - xosiz,
    height: ysiz - yosiz,
    numComponents,
    ssiz,
    bitsPerSample: (ssiz & 0x7f) + 1,
    isSigned: (ssiz & 0x80) !== 0,
  }
}

/**
 * Wraps a raw J2K codestream in the minimum set of JP2 boxes, with a filler
 * box in front of the codestream that openjpeg has no handler for and will
 * therefore skip (jp2.c, the unknown-box branch of opj_jp2_read_header).
 *
 * @param {Buffer} codestream a bare .j2k codestream
 * @param {{fillerBytes?: number}} [options]
 * @returns {Buffer} a JP2 file
 */
export function wrapInJp2(codestream, { fillerBytes = DEFAULT_FILLER_BYTES } = {}) {
  const siz = parseSiz(codestream)

  const signature = box("jP  ", Buffer.from([0x0d, 0x0a, 0x87, 0x0a]))
  const fileType = box("ftyp", Buffer.from("jp2 ", "ascii"), u32(0), Buffer.from("jp2 ", "ascii"))

  const ihdr = box(
    "ihdr",
    u32(siz.height),
    u32(siz.width),
    u16(siz.numComponents),
    Buffer.from([
      siz.ssiz,
      7, // C: compression type, always 7
      0, // UnkC: colourspace is known
      0, // IPR: no intellectual property rights box
    ])
  )
  // METH=1 (enumerated), PREC=0, APPROX=0, then EnumCS.
  const enumCs = siz.numComponents >= 3 ? 16 /* sRGB */ : 17 /* greyscale */
  const colr = box("colr", Buffer.from([1, 0, 0]), u32(enumCs))

  // A 'free' box is exactly this: padding with no defined meaning. openjpeg
  // has no handler for it, so it takes the skip path we are trying to reach.
  const filler = box("free", Buffer.alloc(fillerBytes))

  return Buffer.concat([
    signature,
    fileType,
    box("jp2h", ihdr, colr),
    filler,
    box("jp2c", codestream),
  ])
}

// CLI: node test/helpers/jp2.mjs <in.j2k> <out.jp2> [fillerBytes]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, fillerBytes] = process.argv.slice(2)
  if (!input || !output) {
    console.error("usage: node test/helpers/jp2.mjs <in.j2k> <out.jp2> [fillerBytes]")
    process.exit(1)
  }
  const jp2 = wrapInJp2(readFileSync(input), {
    fillerBytes: fillerBytes ? Number(fillerBytes) : undefined,
  })
  writeFileSync(output, jp2)
  console.log(`wrote ${output} (${jp2.length} bytes)`)
}
