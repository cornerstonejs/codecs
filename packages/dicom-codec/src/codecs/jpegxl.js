const codecModule = require("@cornerstonejs/codec-libjxl");
const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "JpegXLEncoder",
  decoderName: "JpegXLDecoder",
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
    // Base module loads it's own codecModule
    undefined,
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
    undefined,
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
