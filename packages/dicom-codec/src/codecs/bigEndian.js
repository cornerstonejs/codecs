const codecFactory = require("./codecFactory");

/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  // assign it and prevent initialization
  codec: {},
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "bigEndian",
  encoderName: "bigEndian",
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
  const { bitsAllocated, pixelRepresentation } = imageInfo;

  if (bitsAllocated === 16) {
    let arrayBuffer = imageFrame.buffer;

    let offset = imageFrame.byteOffset;
    const length = imageFrame.length;
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
    // Do the byte swap
    for (let i = 0; i < result.length; i++) {
      result[i] = swap16(result[i]);
    }
  } else if (bitsAllocated === 8) {
    result = imageFrame;
  }

  return result;
}

/* eslint no-bitwise: 0 */
function swap16(val) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
