const codecModule = require("@cornerstonejs/codec-charls");
const codecWasmModule = require("@cornerstonejs/codec-charls/wasmjs");
const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "JpegLSEncoder",
  decoderName: "JpegLSDecoder",
  setQuality: (encoder, { lossless = true, delta = 3 }) => {
    encoder.setNearLossless(lossless ? 0 : delta);
  },
};

/**
 * Decode imageFrame using jpegls decoder.
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
 * Encode imageFrame to jpegls format.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {ExtendedImageInfo} imageInfo image info options.
 * @param {Object} options encode option.
 * @returns Object containing encoded image frame and imageInfo (current) data
 */
async function encode(imageFrame, imageInfo, options = {}) {
  return codecFactory.runProcess(
    codecWrapper,
    codecModule,
    codecWasmModule,
    codecWrapper.encoderName,
    (context) => {
      function beforeEncode(encoderInstance) {
        encoderInstance.setNearLossless(0);
      }

      return codecFactory.encode(
        context,
        codecWrapper,
        imageFrame,
        imageInfo,
        Object.assign({}, options, { beforeEncode })
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
