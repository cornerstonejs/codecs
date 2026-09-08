const codecModule = require("@cornerstonejs/codec-libjpeg-turbo-12bit");
const codecWasmModule = require("@cornerstonejs/codec-libjpeg-turbo-12bit/wasmjs");
const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "JPEGEncoder",
  decoderName: "JPEGDecoder",
};

/**
 * Decode imageFrame using libjpegTurbo 12bit decoder.
 *
 * @param {TypedArray} imageFrame to decode.
 * @param {ExtendedImageInfo} imageInfo image info options.
 * @returns Object containing decoded image frame and imageInfo (current) data.
 */
async function decode(imageFrame, imageInfo) {
  return codecFactory.runProcess(
    codecWrapper,
    codecModule,
    codecWasmModule,
    codecWrapper.decoderName,
    (context) => {
      return codecFactory.decode(context, codecWrapper, imageFrame, imageInfo);
    }
  );
}

/**
 * <<Not available>> The libjpeg-turbo 12bit build does not expose an
 * encoder (see src/jslib.cpp — the JPEGEncoder bindings are disabled), so
 * encoding is not supported for this codec.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {ExtendedImageInfo} imageInfo image info options.
 * @param {Object} options encode option.
 * @returns Object containing encoded image frame and imageInfo (current) data
 */
async function encode(imageFrame, imageInfo, options = {}) {
  throw Error("Encoder not supported for codec: libjpeg-turbo 12bit");
}

function getPixelData(imageFrame, imageInfo) {
  return codecFactory.getPixelData(imageFrame, imageInfo);
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
