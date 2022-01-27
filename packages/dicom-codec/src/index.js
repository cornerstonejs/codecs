const codecs = require("./codecs");
const logger = require("./utils/logger");

function assertCodec(codec, transferSyntaxUID) {
  if (!codec) {
    throw Error("Codec not found:" + transferSyntaxUID);
  }
}

/**
 * Returning type for decode/encode operations.
 * 
 * @typedef OperationResult
 * @type {object}
 * @property {TypedArray} imageFrame - image frame data from operatation's result.
 * @property {object} imageInfo - image information. Properties name are codec based.
 * @property {object} processInfo - process information.
 */

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
  const codec = codecs.getCodec(decoderTransferSyntaxUID);
  assertCodec(codec, decoderTransferSyntaxUID);

  return codec.decode(imageFrame, imageInfo);
}

/**
 * Encode imageFrame using codec for encoderTransferSyntaxUID.
 * 
 * @param {TypedArray} imageFrame to encode.
 * @param {object} imageInfo image information.
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
  const codec = codecs.getCodec(encoderTransferSyntaxUID);
  assertCodec(codec, encoderTransferSyntaxUID);

  return codec.encode(imageFrame, imageInfo, options);
}

/**
 * Transcode image frame from one transferSyntaxUid to another transferSyntaxUid.
 * Its a 2 step operation: first decode (if necessary) then encode (if necessary).
 *
 * @param {TypedArray} imageFrame image frame to be decoded
 * @param {object} imageInfo image information
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
  const decoded = await decode(imageFrame, imageInfo, sourceTransferSyntaxUID);
  return encode(
    decoded.imageFrame,
    decoded.imageInfo,
    targetTransferSyntaxUID,
    encodeOptions
  );
}

/**
 * Return pixel data based on transfer syntax.
 * 
 * @param {TypedArray} imageFrame imageframe to get pixel data from.
 * @param {string} transferSyntaxUID transfer syntax for current imageframe.
 * @param {object} imageInfo image information.
 * @returns Typed array.
 *
 * @throws Will throw an error if codec is not found.
 * @throws Will throw an error if there is an exception when getting pixelData.
 */
function getPixelData(imageFrame, transferSyntaxUID, imageInfo = {}) {
  const codec = codecs.getCodec(transferSyntaxUID);
  assertCodec(codec, transferSyntaxUID);

  return codec.getPixelData(imageFrame, imageInfo);
}

/**
 * Tell whether there is a codec for given transferSyntaxUID or not.
 *
 * @param {string} transferSyntaxUID transfer syntax uid value.
 * @returns {boolean}
 */
function hasCodec(transferSyntaxUID) {
  return codecs.hasCodec(transferSyntaxUID);
}

/**
 * Set codecs general configuration.
 * 
 * @param {object} options 
 * @param {boolean} [options.verbose=false] Set verbose mode.
 */
function setConfig(options = {}) {
  if (options.verbose) {
    logger.setVerbose();
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
};

module.exports = dicomCodec;
