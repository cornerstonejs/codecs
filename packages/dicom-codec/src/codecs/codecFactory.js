const logger = require("../utils/logger");
const processTimer = require("../utils/processTimer");

/**
 * Change by reference the given codecConfig and set related Encoder/Decoder from codec.
 *
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {Object} codec codec instance.
 * @param {string} encoderName encoder name (codec property key).
 * @param {string} decoderName decoder name (codec property key).
 */
function setCodec(codecConfig, encoderName, decoderName, codec = {}) {
  codecConfig.Encoder = codec[encoderName];
  codecConfig.Decoder = codec[decoderName];
  codecConfig.codec = codec;
}

/**
 * Initialize codec dynamically. It has two initialization strategies: js based or wasm based.
 * In case dynamic initialization is not needed consumer can set by default codec into codecConfig.codec. This will skip initialization process.
 *
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {*} codecModule js based module promise for initialization. Promise is resolved with the codec instance.
 * @param {*} codecWasmModule wasm based module promise for initialization. Promise is resolved with the codec instance.
 * @param {string} encoderName encoder name to seek for encoder on codec instance.
 * @param {string} decoderName decoder name to seek for decoder on codec instance.
 */
async function initialize(
  codecConfig,
  codecModule,
  codecWasmModule,
  encoderName,
  decoderName
) {
  if (codecConfig.codec) {
    setCodec(codecConfig, encoderName, decoderName, codecConfig.codec);
    return Promise.resolve(true);
  }

  return new Promise((resolve, reject) => {
    if (codecModule) {
      console.log("codecModule=", codecConfig, codecModule);
      codecModule().then((codec) => {
        setCodec(codecConfig, encoderName, decoderName, codec);
        resolve(true);
      }, reject);
    } else if (codecWasmModule) {
      codecWasmModule().then((codec) => {
        setCodec(codecConfig, encoderName, decoderName, codec);
        resolve(true);
      }, reject);
    }
  });
}

/**
 * Wrapper method to getException from codec. Otherwise received exception is returned.
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {Error} exception current exception.
 * @returns exception (current or processed from codec).
 */
function getExceptionMessage(codecConfig, exception) {
  return typeof exception === "number" && codecConfig.codec.getExceptionMessage
    ? codecConfig.codec.getExceptionMessage(exception)
    : exception;
}

/**
 * Runner of processes. It will execute the given process (through processCallback) after ensuring codec is initialized.
 *
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {*} codecModule js based module promise for initialization. Promise is resolved with the codec instance.
 * @param {*} codecWasmModule wasm based module promise for initialization. Promise is resolved with the codec instance.
 * @param {string} processName name of current process
 * @param {string} processCallback callback for current process.
 *
 * @returns returning type of processCallback
 *
 * @throws Will throw in case initialize fails or process fails
 */
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
    const result = processCallback(context);
    // console.log("Got result", result);
    return result;
  } catch (e) {
    throw getExceptionMessage(codecConfig, e);
  }
}

/**
 *
 * Returns imageInfo object based on previous and target imageInfo.
 * It combines both to produce the returning type of a process operation.
 *
 * @param {ImageInfo} previousImageInfo previous imageInfo object.
 * @param {ExtendedImageInfo} imageInfo current imageInfo object (after operation).
 * @returns {ExtendedImageInfo} imageInfo object.
 */
function getTargetImageInfo(previousImageInfo, imageInfo) {
  const { bitsPerSample, componentCount } = imageInfo;
  const { height, width, signed } = imageInfo;

  return {
    ...previousImageInfo,
    ...imageInfo,
    bitsPerPixel: bitsPerSample,
    columns: width,
    componentsPerPixel: componentCount,
    rows: height,
    signed,
  };
}

/**
 * Returns pixel data based on the given imageInfo.
 *
 * @param {TypedArray} imageFrame current image frame pixels.
 * @param {ExtendedImageInfo} imageInfo current imageInfo object (after operation).
 * @returns Typed array based on imageInfo properties.
 */
function getPixelData(imageFrame, imageInfo = {}) {
  const { signed = false, bitsPerSample = 0 } = imageInfo;

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

/**
 * Returns typed array from the given typed array param.
 * It prevents the returning type to be Uint8ClampedArray.
 *
 * @param {TypedArray} typedArray A typed array object.
 * @returns Typed array.
 */
function getImageFrame(typedArray) {
  if (typedArray instanceof Uint8ClampedArray) {
    return new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength
    );
  }

  return typedArray;
}

/**
 * Encode imageFrame using Encoder from the given local param.
 *
 * Its the common encode process for js/wasm codec's based.
 *
 * @param {Object} context runner context.
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {TypedArray} imageFrame current image frame pixels.
 * @param {ExtendedImageInfo} imageInfo current image info object.
 * @param {*} [options] process options.
 * @returns Object containing encoded image frame and imageInfo (current) data
 */
function encode(context, codecConfig, imageFrame, imageInfo, options = {}) {
  const { iterations = 1 } = options;
  const encoderInstance = new codecConfig.Encoder();
  const decodedTypedArray = encoderInstance.getDecodedBuffer(imageInfo);
  decodedTypedArray.set(imageFrame);

  const { beforeEncode = () => {} } = options;

  beforeEncode(encoderInstance, codecConfig);

  context.timer.init("To encode length: " + imageFrame.length);
  for (let i = 0; i < iterations; i++) {
    encoderInstance.encode();
  }

  context.timer.end();

  const encodedTypedArray = encoderInstance.getEncodedBuffer();
  context.logger.log("Encoded length:" + encodedTypedArray.length);
  context.logger.log(
    "Encoded is a Typed array of: " + encodedTypedArray.constructor.name
  );

  // cleanup allocated memory
  encoderInstance.delete();

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: getImageFrame(encodedTypedArray),
    imageInfo: getTargetImageInfo(imageInfo, imageInfo),
    processInfo,
  };
}

/**
 * Decode (encoded) imageFrame using Decoder from the given local param.
 *
 * Its the common encode process for js/wasm codec's based.
 *
 * @param {Object} context runner context.
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @param {TypedArray} imageFrame current image frame pixels.
 * @param {ExtendedImageInfo} imageInfo previous image info object.
 * @returns Object containing decoded image frame and imageInfo (current) data
 *
 */
function decode(context, codecConfig, imageFrame, imageInfo) {
  if (!imageFrame?.length) {
    throw new Error("Image frame not defined for decoding");
  }
  const decoderInstance = new codecConfig.Decoder();

  const { length } = imageFrame;
  // get pointer to the source/encoded bit stream buffer in WASM memory
  // that can hold the encoded bitstream
  const encodedTypedArray = decoderInstance.getEncodedBuffer(length);

  // copy the encoded bitstream into WASM memory buffer
  encodedTypedArray.set(imageFrame);
  context.timer.init("To decode length: " + length);
  // decode it
  decoderInstance.decode();
  context.timer.end();

  const decodedTypedArray = decoderInstance.getDecodedBuffer();

  context.logger.log("Decoded length:" + decodedTypedArray.length);
  context.logger.log(
    "Decoded is a Typed array of: " + decodedTypedArray.constructor.name
  );

  // get information about the decoded image
  const decodedImageInfo = decoderInstance.getFrameInfo();

  // cleanup allocated memory
  decoderInstance.delete();

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: getImageFrame(decodedTypedArray),
    imageInfo: getTargetImageInfo(imageInfo, decodedImageInfo),
    processInfo,
  };
}

exports.runProcess = runProcess;
exports.encode = encode;
exports.decode = decode;
exports.initialize = initialize;
exports.getPixelData = getPixelData;
exports.getTargetImageInfo = getTargetImageInfo;
