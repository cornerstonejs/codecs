const codecModule = require("@cornerstonejs/codec-charls");
const codecWasmModule = require("@cornerstonejs/codec-charls/wasmjs");
const codecFactory = require("./codecFactory");

const local = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "JpegLSEncoder",
  decoderName: "JpegLSDecoder",
};

/**
 * Decode compressed imageFrame from jpegls
 *
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
      return codecFactory.decode(
        context,
        local,
        compressedImageFrame,
        previousImageInfo
      );
    }
  );
}

/**
 * Encode uncompressed imageFrame to jpegls compressed format.
 *
 * @param {*} uncompressedImageFrame uncompressed image frame
 * @param {*} previousImageInfo image info options
 * @param {*} options encode option
 * @returns Object containing encoded image frame and previousImageInfo/imageInfo (current) data
 */
async function encode(uncompressedImageFrame, previousImageInfo, options = {}) {
  return codecFactory.runProcess(
    local,
    codecModule,
    codecWasmModule,
    local.encoderName,
    (context) => {
      function beforeEncode(encoderInstance) {
        encoderInstance.setNearLossless(0);
      }

      return codecFactory.encode(
        context,
        local,
        uncompressedImageFrame,
        previousImageInfo,
        Object.assign({}, options, { beforeEncode })
      );
    }
  );
}

function getPixelData(imageFrame, frameInfo) {
  return codecFactory.getPixelData(imageFrame, frameInfo);
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
