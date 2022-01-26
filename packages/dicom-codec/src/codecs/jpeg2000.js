const codecModule = require("@cornerstonejs/codec-openjpeg");
const codecWasmModule = require("@cornerstonejs/codec-openjpeg/wasmjs");
const codecFactory = require("./codecFactory");

const local = {
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  encoderName: "J2KEncoder",
  decoderName: "J2KDecoder",
};

/**
 * Decode compressed imageFrame from jpeg2000
 *
 * @param {*} compressedImageFrame to decompress
 * @param {*} previousImageInfo image info options
 * @returns Object containing decoded image frame and previousImageInfo/imageInfo (current) data
 *
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
 * Encode uncompressed imageFrame to jpeg2000 compressed format.
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
      return codecFactory.encode(
        context,
        local,
        uncompressedImageFrame,
        previousImageInfo,
        options
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
