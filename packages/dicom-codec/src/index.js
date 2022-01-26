const codecs = require("./codecs");
const logger = require("./utils/logger");

function assertCodec(codec, transferSyntaxUID) {
  if (!codec) {
    throw Error("Codec not found:" + transferSyntaxUID);
  }
}
/**
 * Decodes imageFrame using codec for decoderTransferSyntaxUID
 * @param {*} imageFrame image frame to be decoded
 * @param {*} imageInfo image information
 * @param {*} decoderTransferSyntaxUID codec transferSyntaxUID value
 *
 * @returns Object containing decoded image frame and previousImageInfo/imageInfo (current) data
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
 * Encodes imageFrame using codec for encoderTransferSyntaxUID
 * @param {*} imageFrame image frame to be decoded
 * @param {*} imageInfo image information
 * @param {*} encoderTransferSyntaxUID codec transferSyntaxUID value
 *
 * @returns Object containing encoded image frame and previousImageInfo/imageInfo (current) data
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
 * Its a 2 step operation: first decode then encode.
 *
 * @param {*} imageFrame image frame to be decoded
 * @param {*} imageInfo image information
 * @param {*} sourceTransferSyntaxUID codec decoder transferSyntaxUID value
 * @param {*} targetTransferSyntaxUID codec encoder transferSyntaxUID value
 * @param {*} encodeOptions options for encoding
 *
 * @returns Object containing encoded image frame and previousImageInfo/imageInfo (current) data
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
 * @param {*} imageFrame imageframe to get pixel data from.
 * @param {*} transferSyntaxUID transfer syntax for current imageframe
 * @param {*} imageInfo image information
 * @returns Typed array
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
 * Tell whether there is a codec for given transferSyntaxUID or not
 *
 * @param {*} transferSyntaxUID transfer syntax uid value.
 * @returns boolean
 */
function hasCodec(transferSyntaxUID) {
  return codecs.hasCodec(transferSyntaxUID);
}

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
