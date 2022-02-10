const jpeglsCodec = require("./jpegls");
const jpeg2000Codec = require("./jpeg2000");
const littleEndianCodec = require("./littleEndian");
const jpegLosslessCodec = require("./jpegLossless");
const rleLosslessCodec = require("./rleLossless");
const bigEndianCodec = require("./bigEndian");
const libjpegTurbo8BitCodec = require("./libjpegTurbo8bit");
const libjpegTurbo12BitCodec = require("./libjpegTurbo12bit");

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

/**
 * Define extended image information.
 * It can be resumed as: extended and generic image info object that contains properties to be used by any codec.
 * 
 * @typedef ExtendedImageInfo
 * @type {object}
 * @property {number} rows - Number with the image rows/height.
 * @property {number} [height] - Number with the image rows/height.
 * @property {number} columns - Number with the image columns/width.
 * @property {number} [width] - Number with the image columns/width.
 * @property {number} bitsAllocated - Number with bits per pixel sample.
 * @property {number} [bitsPerPixel] - Number with bits per pixel sample.
 * @property {number} [bitsPerSample] - Number with bits per pixel sample.
 * @property {number} samplesPerPixel -  Number with number of components per pixel.
 * @property {number} [componentCount] -  Number with number of components per pixel.
 * @property {number} [componentsPerPixel] -  Number with number of components per pixel.
 * @property {boolean} [signed] - Boolean true if pixel data is signed, false if unsigned.
 * /
 * 
/**
 * Adapt imageInfo to an object of properties which will satisfy any codec.
 * Object keys are based on codec need.
 * 
 * @param {ImageInfo} imageInfo 
 * @returns {ExtendedImageInfo} Adapted imageInfo to all codecs.
 */
function adaptImageInfo(imageInfo) {
  const { rows, columns, bitsAllocated, signed, samplesPerPixel } = imageInfo;

  return {
    bitsAllocated,
    samplesPerPixel,
    rows, // Number with the image rows/height
    columns, // Number with the image columns/width
    width: columns,
    height: rows,
    bitsPerPixel: bitsAllocated, // Number with bits per pixel
    bitsPerSample: bitsAllocated,
    componentCount: samplesPerPixel,
    componentsPerPixel: samplesPerPixel,
    signed,
    isSigned: signed
  };
}

exports.adaptImageInfo = adaptImageInfo;
exports.getCodec = getCodec;
exports.hasCodec = hasCodec;
