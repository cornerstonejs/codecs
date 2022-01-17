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
 * @param {*} compressedImageFrame to decopress
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
      const decoderInstance = new local.Decoder();

      // get pointer to the source/encoded bit stream buffer in WASM memory
      // that can hold the encoded bitstream
      const encodedBufferInWASM = decoderInstance.getEncodedBuffer(
        compressedImageFrame.length
      );

      // copy the encoded bitstream into WASM memory buffer
      encodedBufferInWASM.set(compressedImageFrame);
      context.timer.init();
      // decode it
      decoderInstance.decode();
      context.timer.end();

      const decodedBuffer = decoderInstance.getDecodedBuffer();

      const imageFrame = codecFactory.getImageFrame(decodedBuffer.length);
      imageFrame.set(decodedBuffer);

      // get information about the decoded image
      const frameInfo = decoderInstance.getFrameInfo();

      // cleanup allocated memory
      decoderInstance.delete();

      const processInfo = {
        duration: context.timer.getDuration(),
      };

      return {
        imageFrame,
        imageInfo: codecFactory.getTargetImageInfo(
          frameInfo,
          previousImageInfo
        ),
        previousImageInfo,
        processInfo,
      };
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
      const { iterations = 1 } = options;
      const encoderInstance = new local.Encoder();
      const decodedBuffer = encoderInstance.getDecodedBuffer(previousImageInfo);
      decodedBuffer.set(uncompressedImageFrame);

      context.timer.init(
        "uncompressedImageFrame.length:" + uncompressedImageFrame.length
      );
      for (let i = 0; i < iterations; i++) {
        encoderInstance.encode();
      }

      context.timer.end();

      const encodedBuffer = encoderInstance.getEncodedBuffer();
      context.logger.log("encoded length=" + encodedBuffer.length);

      const imageFrame = codecFactory.getImageFrame(
        encoderInstance.getEncodedBuffer()
      );

      // cleanup allocated memory
      encoderInstance.delete();

      const processInfo = {
        duration: context.timer.getDuration(),
      };

      return {
        imageFrame,
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

function getPixelData(imageFrame, frameInfo) {
  return codecFactory.getPixelData(imageFrame, frameInfo);
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
