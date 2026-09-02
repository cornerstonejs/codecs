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
      context.timer.end();
      context.logger.log("Use getPixel");

      const processInfo = {
        duration: context.timer.getDuration(),
      };

      return {
        imageFrame,
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
    // buffers on it.
    //
    // The end bound is not optional. slice(offset) copies through the end of
    // the BACKING buffer, and imageFrame is typically a single frame's view
    // into a whole multi-frame P10 buffer — so the one-argument form allocates
    // and copies the entire rest of the file to realign one frame (measured:
    // 67 MB for a 1 MB frame in a 64 MB buffer). The returned view's length
    // hides it, because it is correct either way.
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset, offset + imageFrame.byteLength);
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
  } else if (bitsAllocated === 8 || bitsAllocated === 1) {
    // Both are byte streams as far as this function is concerned, so there is
    // nothing to swap: 8-bit samples are one byte each, and 1-bit PixelData is
    // bit-packed eight samples to a byte and stays packed here (see the
    // big-endian package's decode for why no word swap is applied).
    result = imageFrame;
  } else if (bitsAllocated === 32) {
    // imageFrame is typically a view into the full DICOM P10 buffer, so its
    // byteOffset is even (DICOM guarantees even lengths) but not necessarily
    // 4-byte aligned; 32-bit typed-array views require 4-byte alignment,
    // so copy the bytes to a fresh, aligned buffer when needed — bounded to
    // this frame, for the reason given on the 16-bit branch above
    if (offset % 4) {
      arrayBuffer = arrayBuffer.slice(offset, offset + imageFrame.byteLength);
      offset = 0;
    }

    // The swap is a pure byte permutation, so it is done through a
    // Uint32Array view regardless of how the result is interpreted below
    const swapView = new Uint32Array(arrayBuffer, offset, length / 4);
    for (let i = 0; i < swapView.length; i++) {
      swapView[i] = swap32(swapView[i]);
    }

    // 32-bit PixelData is integer data (signed per pixelRepresentation);
    // it is only float when pixelRepresentation is absent (e.g. the
    // FloatPixelData element), matching cornerstone3D's decodeLittleEndian
    if (pixelRepresentation === 0) {
      result = swapView;
    } else if (pixelRepresentation === 1) {
      result = new Int32Array(arrayBuffer, offset, length / 4);
    } else {
      result = new Float32Array(arrayBuffer, offset, length / 4);
    }
  }

  return result;
}

/* eslint no-bitwise: 0 */
function swap16(val) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}

function swap32(val) {
  return (
    ((val & 0xff) << 24) |
    ((val & 0xff00) << 8) |
    ((val >> 8) & 0xff00) |
    ((val >> 24) & 0xff)
  );
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
