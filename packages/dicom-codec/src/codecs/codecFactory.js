const logger = require("../utils/logger");
const processTimer = require("../utils/processTimer");

function setCodec(codecConfig, codec, encoderName, decoderName) {
  codecConfig.Encoder = codec[encoderName];
  codecConfig.Decoder = codec[decoderName];
  codecConfig.codec = codec;
}

async function initialize(
  codecConfig,
  codecFactory,
  codecWasmFactory,
  encoderName,
  decoderName
) {
  if (codecConfig.codec) {
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    if (codecFactory) {
      codecFactory().then((codec) => {
        setCodec(codecConfig, codec, encoderName, decoderName);
        resolve(true);
      }, reject);
    } else if (typeof codecWasmFactory !== "undefined") {
      codecWasmFactory().then((codec) => {
        setCodec(codecConfig, codec, encoderName, decoderName);
        resolve(true);
      }, reject);
    }
  });
}

function getExceptionMessage(codecConfig, exception) {
  return typeof exception === "number"
    ? codecConfig.codec.getExceptionMessage(exception)
    : exception;
}

async function runProcess(
  codecConfig,
  codecModule,
  codecWasmModule,
  processName,
  processCallback
) {
  const timer = processTimer(processName, logger);
  const context = {
    timer,
    logger,
  };

  try {
    await initialize(
      codecConfig,
      codecModule,
      codecWasmModule,
      codecConfig.encoderName,
      codecConfig.decoderName
    );
    return processCallback(context);
  } catch (e) {
    throw getExceptionMessage(codecConfig, e);
  }
}

function getImageFrame(bufferOrLength) {
  if (typeof bufferOrLength === "number") {
    return new Uint8Array(bufferOrLength);
  } else {
    return new Uint8Array(
      bufferOrLength.buffer,
      bufferOrLength.byteOffset,
      bufferOrLength.byteLength
    );
  }
}

function getTargetImageInfo(previousImageInfo, frameInfo) {
  return {
    ...previousImageInfo,
    ...frameInfo,
    bitsPerPixel: frameInfo.bitsPerSample,
    columns: frameInfo.width,
    componentsPerPixel: frameInfo.componentCount,
    rows: frameInfo.height,
    signed: previousImageInfo.signed,
  };
}

function getPixelData(imageFrame, frameInfo = {}) {
  const { signed = false, bitsPerSample = 0 } = frameInfo;

  if (bitsPerSample > 8) {
    if (signed) {
      return new Int16Array(
        imageFrame.buffer,
        imageFrame.byteOffset,
        imageFrame.byteLength / 2
      );
    }

    return new Uint16Array(
      imageFrame.buffer,
      imageFrame.byteOffset,
      imageFrame.byteLength / 2
    );
  }

  if (signed) {
    return new Int8Array(
      imageFrame.buffer,
      imageFrame.byteOffset,
      imageFrame.byteLength
    );
  }

  return new Uint8Array(
    imageFrame.buffer,
    imageFrame.byteOffset,
    imageFrame.byteLength
  );
}

exports.runProcess = runProcess;
exports.initialize = initialize;
exports.getImageFrame = getImageFrame;
exports.getPixelData = getPixelData;
exports.getTargetImageInfo = getTargetImageInfo;
