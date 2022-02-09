const codecFactory = require("./codecFactory");
/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  // assign it and prevent initialization
  codec: {},
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "littleEndian",
  encoderName: "littleEndian",
};

async function decode(imageFrame, imageInfo) {
  return codecFactory.runProcess(
    codecWrapper,
    undefined,
    undefined,
    codecWrapper.decoderName,
    (context) => {
      context.timer.init("To decode length: " + imageFrame.length);
      const _imageFrame = getPixelData(imageFrame, imageInfo);

      context.timer.end();

      context.logger.log("Decoded length:" + _imageFrame.length);
      context.logger.log(
        "Decoded is a Typed array of: " + _imageFrame.constructor.name
      );

      const processInfo = {
        duration: context.timer.getDuration(),
      };

      return {
        imageFrame: _imageFrame,
        imageInfo: codecFactory.getTargetImageInfo(imageInfo, imageInfo),
        processInfo,
      };
    }
  );
}

async function encode(imageFrame, imageInfo, options = {}) {
  // Use getPixelData in case pixelData is needed.
  throw Error(
    "Encoder not found or not applied for codec:" + codecWrapper.encoderName
  );
}

function getPixelData(imageFrame, imageInfo) {
  let result;
  let arrayBuffer = imageFrame.buffer;
  let offset = imageFrame.byteOffset;
  const length = imageFrame.length;

  const { bitsAllocated, pixelRepresentation } = imageInfo;

  if (bitsAllocated === 16) {
    // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
    // buffers on it
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    if (pixelRepresentation === 0) {
      result = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      result = new Int16Array(arrayBuffer, offset, length / 2);
    }
  } else if (bitsAllocated === 8 || bitsAllocated === 1) {
    result = imageFrame;
  } else if (bitsAllocated === 32) {
    // if pixel data is not aligned on even boundary, shift it
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    result = new Float32Array(arrayBuffer, offset, length / 4);
  }

  return result;
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
