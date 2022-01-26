const codecFactory = require("./codecFactory");

const local = {
  // assign it and prevent initialization
  codec: {},
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "rleLossless",
  encoderName: "rleLossless",
};

function decode(imageFrame, previousImageInfo) {
  return codecFactory.runProcess(
    local,
    codecModule,
    codecWasmModule,
    local.decoderName,
    (context) => {
      if (previousImageInfo.bitsAllocated === 8) {
        if (previousImageInfo.planarConfiguration) {
          return decode8Planar(imageFrame, previousImageInfo, context);
        }

        return decode8(imageFrame, previousImageInfo, context);
      } else if (previousImageInfo.bitsAllocated === 16) {
        return decode16(imageFrame, previousImageInfo, context);
      }

      throw new Error("unsupported pixel format for RLE");
    }
  );
}

function decode8(imageFrame, previousImageInfo, context) {
  const frameSize = previousImageInfo.rows * previousImageInfo.columns;
  const outFrame = new ArrayBuffer(
    frameSize * previousImageInfo.samplesPerPixel
  );
  const header = new DataView(imageFrame.buffer, imageFrame.byteOffset);
  const data = new Int8Array(imageFrame.buffer, imageFrame.byteOffset);
  const out = new Int8Array(outFrame);

  context.timer.init("To decode length: " + imageFrame.length);
  let outIndex = 0;
  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    outIndex = s;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = imageFrame.length;
    }

    const endOfSegment = frameSize * numSegments;

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        // copy n bytes
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex += previousImageInfo.samplesPerPixel;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        // run of n bytes

        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex += previousImageInfo.samplesPerPixel;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }

  context.timer.end();

  context.logger.log("Decoded length:" + out.length);
  context.logger.log("Decoded is a Typed array of: " + out.constructor.name);

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: out,
    imageInfo: codecFactory.getTargetImageInfo(
      previousImageInfo,
      previousImageInfo
    ),
    previousImageInfo,
    processInfo,
  };
}

function decode8Planar(imageFrame, previousImageInfo, context) {
  const frameSize = previousImageInfo.rows * previousImageInfo.columns;
  const outFrame = new ArrayBuffer(
    frameSize * previousImageInfo.samplesPerPixel
  );
  const header = new DataView(imageFrame.buffer, imageFrame.byteOffset);
  const data = new Int8Array(imageFrame.buffer, imageFrame.byteOffset);
  const out = new Int8Array(outFrame);

  context.timer.init("To decode length: " + imageFrame.length);
  let outIndex = 0;
  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    outIndex = s * frameSize;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = imageFrame.length;
    }

    const endOfSegment = frameSize * numSegments;

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        // copy n bytes
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        // run of n bytes

        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex++;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }

  context.timer.end();

  context.logger.log("Decoded length:" + out.length);
  context.logger.log("Decoded is a Typed array of: " + out.constructor.name);

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: out,
    imageInfo: codecFactory.getTargetImageInfo(
      previousImageInfo,
      previousImageInfo
    ),
    previousImageInfo,
    processInfo,
  };
}

function decode16(imageFrame, previousImageInfo, context) {
  const frameSize = previousImageInfo.rows * previousImageInfo.columns;
  const outFrame = new ArrayBuffer(
    frameSize * previousImageInfo.samplesPerPixel * 2
  );

  const header = new DataView(imageFrame.buffer, imageFrame.byteOffset);
  const data = new Int8Array(imageFrame.buffer, imageFrame.byteOffset);
  const out = new Int8Array(outFrame);

  context.timer.init("To decode length: " + imageFrame.length);
  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    let outIndex = 0;
    const highByte = s === 0 ? 1 : 0;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = imageFrame.length;
    }

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        for (let i = 0; i < n + 1 && outIndex < frameSize; ++i) {
          out[outIndex * 2 + highByte] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];

        for (let j = 0; j < -n + 1 && outIndex < frameSize; ++j) {
          out[outIndex * 2 + highByte] = value;
          outIndex++;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }

  context.timer.end();

  context.logger.log("Decoded length:" + out.length);
  context.logger.log("Decoded is a Typed array of: " + out.constructor.name);

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: out,
    imageInfo: codecFactory.getTargetImageInfo(
      previousImageInfo,
      previousImageInfo
    ),
    previousImageInfo,
    processInfo,
  };
}

function encode() {
  throw Error("Encoder not found for codec:" + local.encoderName);
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
