const logger = require("../utils/logger");
const processTimer = require("../utils/processTimer");

/**
 * Change by reference the given codecConfig and set related Encoder/Decoder from codec.
 *
 * @param {*} codecConfig
 * @param {*} codec
 * @param {*} encoderName
 * @param {*} decoderName
 */
function setCodec(codecConfig, encoderName, decoderName, codec = {}) {
  codecConfig.Encoder = codec[encoderName];
  codecConfig.Decoder = codec[decoderName];
  codecConfig.codec = codec;
}

/**
 * Initialize codec dynamically. It has two initialization strategy: if the module to be initialized is a js based or if its wasm based.
 * In case dynamic initialization is not needed consumer can set by default codec into codecConfig.codec. This will skip initialization process.
 *
 * @param {*} codecConfig
 * @param {*} codecModule js based module promise for initialization. Promise is resolved with the codec instance.
 * @param {*} codecWasmModule wasm based module promise for initialization. Promise is resolved with the codec instance.
 * @param {*} encoderName encoder name to seek for encoder on codec instance.
 * @param {*} decoderName decoder name to seek for decoder on codec instance.
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
    if (typeof codecModule !== "undefined") {
      codecModule().then((codec) => {
        setCodec(codecConfig, encoderName, decoderName, codec);
        resolve(true);
      }, reject);
    } else if (typeof codecWasmModule !== "undefined") {
      codecWasmModule().then((codec) => {
        setCodec(codecConfig, encoderName, decoderName, codec);
        resolve(true);
      }, reject);
    }
  });
}

/**
 * Wrapper method to getException from codec. Otherwise received exception is returned.
 * @param {*} codecConfig codec config
 * @param {*} exception current exception
 * @returns exception (current or from codec)
 */
function getExceptionMessage(codecConfig, exception) {
  return typeof exception === "number"
    ? codecConfig.codec.getExceptionMessage(exception)
    : exception;
}

/**
 * Runner of processes. It will execute the given process (through processCallback) after ensuring codec is initialized.
 *
 * @param {*} codecConfig
 * @param {*} codecModule
 * @param {*} codecWasmModule
 * @param {*} processName
 * @param {*} processCallback
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
    return processCallback(context);
  } catch (e) {
    throw getExceptionMessage(codecConfig, e);
  }
}

/**
 * Shared or default codec getTargetImageInfo (codec must implement its own in case a more specific case is needed).
 *
 * Returns imageInfo object based on previous and target imageInfo.
 * It combines both to produce the returning type of process operations.
 *
 * @param {*} previousImageInfo
 * @param {*} frameInfo
 * @returns
 */
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

/**
 * Shared or default codec getPixelData (codec must implement its own in case a more specific case is needed).
 * Returns pixel data based on frameInfo.
 *
 * @param {*} imageFrame
 * @param {*} frameInfo
 * @returns Typed array based on frameInfo details.
 */
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

/**
 * Returns typed array from the given typed array param.
 * It prevents returning type be Uint8ClampedArray
 * @param {*} typedArray
 * @returns Typed array
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
 * Encode uncompressedImageFrame using Encoder from the given local param.
 *
 * Its common encode process for wasm codec's based.
 *
 * @param {*} context
 * @param {*} local
 * @param {*} uncompressedImageFrame
 * @param {*} previousImageInfo
 * @param {*} options
 * @returns Object containing encoded image frame and previousImageInfo/imageInfo (current) data
 */
function encode(
  context,
  local,
  uncompressedImageFrame,
  previousImageInfo,
  options = {}
) {
  const { iterations = 1 } = options;
  const encoderInstance = new local.Encoder();
  const decodedTypedArray = encoderInstance.getDecodedBuffer(previousImageInfo);
  decodedTypedArray.set(uncompressedImageFrame);

  const { beforeEncode = () => {} } = options;

  beforeEncode(encoderInstance);

  context.timer.init("To encode length: " + uncompressedImageFrame.length);
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
    imageInfo: getTargetImageInfo(previousImageInfo, previousImageInfo),
    previousImageInfo,
    processInfo,
  };
}

/**
 * Decode compressed imageFrame using Decoder from the given local param.
 *
 * Its common encode process for wasm codec's based.
 *
 * @param {*} context
 * @param {*} local
 * @param {*} compressedImageFrame to decompress
 * @param {*} previousImageInfo image info options
 * @returns Object containing decoded image frame and previousImageInfo/imageInfo (current) data
 *
 */
function decode(context, local, compressedImageFrame, previousImageInfo) {
  const decoderInstance = new local.Decoder();

  const { length } = compressedImageFrame;
  // get pointer to the source/encoded bit stream buffer in WASM memory
  // that can hold the encoded bitstream
  const encodedTypedArray = decoderInstance.getEncodedBuffer(length);

  // copy the encoded bitstream into WASM memory buffer
  encodedTypedArray.set(compressedImageFrame);
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
  const frameInfo = decoderInstance.getFrameInfo();

  // cleanup allocated memory
  decoderInstance.delete();

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: getImageFrame(decodedTypedArray),
    imageInfo: getTargetImageInfo(previousImageInfo, frameInfo),
    previousImageInfo,
    processInfo,
  };
}

exports.runProcess = runProcess;
exports.encode = encode;
exports.decode = decode;
exports.initialize = initialize;
exports.getPixelData = getPixelData;
exports.getTargetImageInfo = getTargetImageInfo;
