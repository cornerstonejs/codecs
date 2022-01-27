const jpeglsCodec = require("./jpegls");
const jpeg2000Codec = require("./jpeg2000");
const littleEndianCodec = require("./littleEndian");
const jpegLosslessCodec = require("./jpegLossless");
const rleLosslessCodec = require("./rleLossless");
const bigEndianCodec = require("./bigEndian");
const libjpegTurbo8BitCodec = require("./libjpegTurbo8Bit");
const libjpegTurbo12BitCodec = require("./libjpegTurbo12Bit");

/**
 * Wrapper to codec. It holds current codec, encoder, decoder, name for each.
 * It can be initialized dinamically (do not set codec, but set decoderName and encoderName and use codecFactory initialization) or static assigned (direct assign the codec).
 *
 * @typedef CodecWrapper
 * @type {object}
 * @property {Object} codec - instance.
 * @property {Object} Decoder - function or class for decoder.
 * @property {Object} Encoder - function or class for encoder.
 * @property {Object} decoderName - decoder name. Used to access decoder on codec (codec property key) and also describe decoder.
 * @property {Object} encoderName - encoder name. Used to access encoder on codec (codec property key) and also describe encoder.
 */

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
