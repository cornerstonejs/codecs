const local = {
  // assign it and prevent initialization
  codec: {},
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "littleEndian",
  encoderName: "littleEndian",
};

async function decode(imageFrame, previousImageInfo, pixelData) {
  // little endian Package has different usage of decode.
  // Use getPixelData in case pixelData is needed.
  throw Error(
    "Decoder not found or not applied for codec:" + local.encoderName
  );
}

async function encode(imageFrame, previousImageInfo, options = {}) {
  // Use getPixelData in case pixelData is needed.
  throw Error(
    "Encoder not found or not applied for codec:" + local.encoderName
  );
}

function getPixelData(imageFrame, frameInfo) {
  let result;
  let arrayBuffer = imageFrame.buffer;
  let offset = imageFrame.byteOffset;
  const length = imageFrame.length;

  const { bitsAllocated, pixelRepresentation } = frameInfo;

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
    result = pixelData;
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
