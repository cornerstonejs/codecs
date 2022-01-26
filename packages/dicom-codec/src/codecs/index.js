const jpeglsCodec = require("./jpegls");
const jpeg2000Codec = require("./jpeg2000");
const littleEndianCodec = require("./littleEndian");
const jpegLosslessCodec = require("./jpegLossless");
const rleLosslessCodec = require("./rleLossless");
const bigEndianCodec = require("./bigEndian");
const libjpegTurbo8BitCodec = require("./libjpegTurbo8Bit");
const libjpegTurbo12BitCodec = require("./libjpegTurbo12Bit");

/**
 * @see {@link https://www.dicomlibrary.com/dicom/transfer-syntax/} for transfer syntax details.
 */
const codecsMap = {
  "1.2.840.10008.1.2": littleEndianCodec,
  "1.2.840.10008.1.2.1": littleEndianCodec,
  "1.2.840.10008.1.2.1.99": littleEndianCodec,
  "1.2.840.10008.1.2.2": bigEndianCodec,
  "1.2.840.10008.1.2.4.50": libjpegTurbo8BitCodec,
  "1.2.840.10008.1.2.4.51": libjpegTurbo12BitCodec,
  "1.2.840.10008.1.2.4.57": jpegLosslessCodec,
  "1.2.840.10008.1.2.4.70": jpegLosslessCodec,
  "1.2.840.10008.1.2.4.80": jpeglsCodec,
  "1.2.840.10008.1.2.4.81": jpeglsCodec,
  "1.2.840.10008.1.2.4.90": jpeg2000Codec,
  "1.2.840.10008.1.2.4.91": jpeg2000Codec,
  "1.2.840.10008.1.2.5": rleLosslessCodec,
};

function hasCodec(transferSyntaxUID) {
  return !!codecsMap[transferSyntaxUID];
}

function getCodec(transferSyntaxUID) {
  const codec = codecsMap[transferSyntaxUID];
  if (!codec) {
    throw new Error("unknown transfer syntax UID " + transferSyntaxUID);
  }
  return codec;
}

exports.getCodec = getCodec;
exports.hasCodec = hasCodec;
