const codecs = require("./codecs")
const logger = require("./utils/logger")

function assertCodec(codec, transferSyntaxUID) {
  if (!codec) {
    throw Error("Codec not found:" + transferSyntaxUID)
  }
}

/**
 *  Decode/encode operations' returning type
 *
 * @typedef OperationResult
 * @type {object}
 * @property {TypedArray} imageFrame - image frame data from operatation's result.
 * @property {ExtendedImageInfo} imageInfo - image information. Some properties key belongs to codec and some others are generic information.
 * @property {Object} processInfo - process information.
 *
 */

/**
 * Define image information.
 * 
 * @typedef ImageInfo
 * @type {object}
 * @property {number} rows - Number with the image rows/height.
 * @property {number} columns - Number with the image columns/width.
 * @property {number} bitsAllocated - Number with bits per pixel sample.
 * @property {number} samplesPerPixel -  Number with number of components per pixel.
 * @property {boolean} signed - Boolean true if pixel data is signed, false if unsigned.
 * /

/**
 * Decodes imageFrame using codec for decoderTransferSyntaxUID.
 * 
 * @param {TypedArray} imageFrame to decode.
 * @param {object} imageInfo image information.
 * @param {string} decoderTransferSyntaxUID codec transferSyntaxUID value.
 *
 * @returns {OperationResult} Object containing decoded image frame and previousImageInfo/imageInfo (current) data
 *
 * @throws Will throw an error if codec is not found.
 * @throws Will throw an error if codec's decoder is not found.
 * @throws Will throw an error if there is an exception when decoding.
 */
async function decode(imageFrame, imageInfo, decoderTransferSyntaxUID) {
  const codec = codecs.getCodec(decoderTransferSyntaxUID)
  assertCodec(codec, decoderTransferSyntaxUID)

  return codec.decode(imageFrame, codecs.adaptImageInfo(imageInfo))
}

/**
 * Encode imageFrame using codec for encoderTransferSyntaxUID.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {ImageInfo} imageInfo image information.
 * @param {string} encoderTransferSyntaxUID codec transferSyntaxUID value.
 *
 * @returns {OperationResult} Object containing encoded image frame and previousImageInfo/imageInfo (current) data.
 *
 * @throws Will throw an error if codec is not found.
 * @throws Will throw an error if codec's encoder is not found.
 * @throws Will throw an error if there is an exception when encoding.
 */
async function encode(
  imageFrame,
  imageInfo,
  encoderTransferSyntaxUID,
  options
) {
  const codec = codecs.getCodec(encoderTransferSyntaxUID)
  assertCodec(codec, encoderTransferSyntaxUID)

  return codec.encode(imageFrame, codecs.adaptImageInfo(imageInfo), options)
}

/**
 * Transcode image frame from one transferSyntaxUid to another transferSyntaxUid.
 * Its a 2 step operation: first decode (if necessary) then encode (if necessary).
 *
 * @param {TypedArray} imageFrame image frame to be decoded
 * @param {ImageInfo} imageInfo image information
 * @param {string} sourceTransferSyntaxUID codec decoder transferSyntaxUID value
 * @param {string} targetTransferSyntaxUID codec encoder transferSyntaxUID value
 * @param {object} encodeOptions options for encoding
 *
 * @returns {OperationResult} Object containing encoded image frame and previousImageInfo/imageInfo (current) data
 *
 * @throws Will throw an error if codec is not found (for encoding or decoding).
 * @throws Will throw an error if source codec's decoder or target codec's encoder is not found.
 * @throws Will throw an error if there is an exception when encoding/decoding.
 */
async function transcode(
  imageFrame,
  imageInfo,
  sourceTransferSyntaxUID,
  targetTransferSyntaxUID,
  encodeOptions
) {
  const decoded = await decode(imageFrame, imageInfo, sourceTransferSyntaxUID)
  return encode(
    decoded.imageFrame,
    decoded.imageInfo,
    targetTransferSyntaxUID,
    encodeOptions
  )
}

/**
 * Return pixel data based on transfer syntax.
 *
 * @param {TypedArray} imageFrame imageframe to get pixel data from.
 * @param {ImageInfo} imageInfo image information.
 * @param {string} transferSyntaxUID transfer syntax for current imageframe.
 * @returns Typed array.
 *
 * @throws Will throw an error if codec is not found.
 * @throws Will throw an error if there is an exception when getting pixelData.
 */
function getPixelData(imageFrame, imageInfo, transferSyntaxUID) {
  const codec = codecs.getCodec(transferSyntaxUID)
  assertCodec(codec, transferSyntaxUID)

  return codec.getPixelData(imageFrame, codecs.adaptImageInfo(imageInfo))
}

/**
 * Tell whether there is a codec for given transferSyntaxUID or not.
 *
 * @param {string} transferSyntaxUID transfer syntax uid value.
 * @returns {boolean}
 */
function hasCodec(transferSyntaxUID) {
  return codecs.hasCodec(transferSyntaxUID)
}

/**
 * Set codecs general configuration.
 *
 * @param {object} options
 * @param {boolean} [options.verbose=false] Set verbose mode.
 */
function setConfig(options = {}) {
  if (options.verbose) {
    logger.setVerbose()
  }
}

/**
 * dicom codec api
 */
const dicomCodec = {
  decode,
  encode,
  getPixelData,
  hasCodec,
  setConfig,
  transcode,
}

module.exports = dicomCodec
