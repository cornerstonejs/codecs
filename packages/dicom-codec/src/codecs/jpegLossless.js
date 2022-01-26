const codecModule = require("jpeg-lossless-decoder-js/release/current/lossless-min");
const codecWasmModule = {};
const codecFactory = require("./codecFactory");

const local = {
  codec: codecModule["lossless"],
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "",
  decoderName: "Decoder",
};

/**
 * Decode compressed imageFrame from jpegLossless
 * @param {*} compressedImageFrame to decompress
 * @param {*} previousImageInfo image info options
 * @returns Object containing decoded image frame and previousImageInfo/imageInfo (current) data
 */
async function decode(compressedImageFrame, previousImageInfo) {
  return codecFactory.runProcess(
    local,
    codecModule,
    codecWasmModule,
    local.decoderName,
    (context) => {
      const byteOutput = previousImageInfo.bitsAllocated <= 8 ? 1 : 2;
      const decoderInstance = new local.Decoder();

      const { buffer, byteOffset, length } = compressedImageFrame;
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

      return {
        imageFrame: decodedTypedArray,
        imageInfo: codecFactory.getTargetImageInfo(
          previousImageInfo,
          previousImageInfo
        ),
        previousImageInfo,
        processInfo,
      };
    }
  );
}

/**
 * Encode uncompressed imageFrame to jpegLossless compressed format.
 *
 * @param {*} uncompressedImageFrame uncompressed image frame
 * @param {*} previousImageInfo image info options
 * @param {*} options encode option
 * @returns Object containing encoded image frame and previousImageInfo/imageInfo (current) data
 */
async function encode(uncompressedImageFrame, previousImageInfo, options = {}) {
  throw Error("Encoder not found for codec: jpeg/" + local.encoderName);
}

function getPixelData(imageFrame, frameInfo) {
  let result;
  if (frameInfo.pixelRepresentation === 0) {
    if (frameInfo.bitsAllocated === 16) {
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
