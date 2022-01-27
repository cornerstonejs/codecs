const codecModule = require("@cornerstonejs/codec-libjpeg-turbo-8bit");
const codecWasmModule = require("@cornerstonejs/codec-libjpeg-turbo-8bit/wasmjs");
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
 * Decode imageFrame using libjpegTurbo 8bit decoder.
 *
 * @param {TypedArray} imageFrame to decode.
 * @param {Object} imageInfo image info options.
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
 * Encode imageFrame to libjpegTurbo 8bit format.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {Object} imageInfo image info options.
 * @param {Object} options encode option.
 * @returns Object containing encoded image frame and imageInfo (current) data.
 */
async function encode(imageFrame, imageInfo, options = {}) {
  return codecFactory.runProcess(
    codecWrapper,
    codecModule,
    codecWasmModule,
    codecWrapper.encoderName,
    (context) => {
      return codecFactory.encode(
        context,
        codecWrapper,
        imageFrame,
        imageInfo,
        options
      );
    }
  );
}

function getPixelData(imageFrame, imageInfo) {
  return codecFactory.getPixelData(imageFrame, imageInfo);
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
