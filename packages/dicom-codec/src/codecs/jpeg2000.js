const codecModule = require("@cornerstonejs/codec-openjpeg");
const codecWasmModule = require("@cornerstonejs/codec-openjpeg/wasmjs");
const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "J2KEncoder",
  decoderName: "J2KDecoder",
};

/**
 * Decode imageFrame using jpeg2000 decoder.
 *
 * @param {TypedArray} imageFrame to decode.
 * @param {ExtendedImageInfo} imageInfo image info options.
 * @returns Object containing decoded image frame and imageInfo (current) data.
 *
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
 * Encode imageFrame to jpeg2000 format.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {ExtendedImageInfo} imageInfo image info options.
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
