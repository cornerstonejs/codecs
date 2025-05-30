const codecModule = require("jpeg-lossless-decoder-js");
const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  codec: codecModule,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "",
  decoderName: "Decoder",
};

/**
 * Decode imageFrame using jpegLossless decoder.
 *
 * @param {TypedArray} imageFrame to decode.
 * @param {ExtendedImageInfo} imageInfo image info options.
 * @returns Object containing decoded image frame and imageInfo (current) data.
 */
async function decode(imageFrame, imageInfo) {
  return codecFactory.runProcess(
    codecWrapper,
    () => codecModule,
    () => {},
    codecWrapper.decoderName,
    (context) => {
      const byteOutput = imageInfo.bitsAllocated <= 8 ? 1 : 2;
      const decoderInstance = new codecWrapper.Decoder();

      const { buffer, byteOffset, length } = imageFrame;
      context.timer.init("To decode length: " + length);

      const decodedTypedArray = decoderInstance.decode(
        buffer,
        byteOffset,
        length,
        byteOutput
      );

      context.timer.end();

      context.logger.log("Decoded length:" + decodedTypedArray.length);
      context.logger.log(
        "Decoded is a Typed array of: " + decodedTypedArray.constructor.name
      );

      const processInfo = {
        duration: context.timer.getDuration(),
      };

      const targetImageInfo = codecFactory.getTargetImageInfo(
        imageInfo,
        imageInfo
      );

      return {
        imageFrame: decodedTypedArray,
        imageInfo: targetImageInfo,
        processInfo,
      };
    }
  );
}

/**
 * <<Not available yet>> Encode imageFrame to jpegLossless format.
 *
 * @param {TypedArray} imageFrame to encode.
 * @param {ExtendedImageInfo} imageInfo image info options
 * @param {Object} options encode option
 * @returns Object containing encoded image frame and imageInfo (current) data
 */
async function encode(_imageFrame, _imageInfo, _options = {}) {
  throw Error("Encoder not found for codec: jpeg/" + codecWrapper.encoderName);
}

function getPixelData(imageFrame, imageInfo) {
  let result;
  if (imageInfo.pixelRepresentation === 0) {
    if (imageInfo.bitsAllocated === 16) {
      result = new Uint16Array(imageFrame.buffer);
    } else {
      // untested!
      result = new Uint8Array(imageFrame.buffer);
    }
  } else {
    result = new Int16Array(imageFrame.buffer);
  }

  return result;
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
