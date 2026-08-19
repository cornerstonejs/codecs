const logger = require("../utils/logger");
const processTimer = require("../utils/processTimer");

/**
 * Emscripten writes a codec's stdout/stderr straight to the console, bypassing
 * this library's own logging policy. That is not just startup noise: openjph's
 * HTJ2KDecoder prints a banner from its CONSTRUCTOR, and decode() below builds
 * a fresh decoder per call — so a consumer decoding a series got one line of
 * console output per frame, unconditionally.
 *
 * Routing `print` through the logger makes that stdout chatter obey the same
 * `setVerbose` flag as the rest of the library: quiet by default, still there
 * when you turn it on. Set once at module init, which covers everything the
 * codec prints afterwards.
 *
 * `printErr` is deliberately NOT overridden. logger.error is gated on the same
 * `verbose` flag as logger.log, so routing stderr through it would silence real
 * decode failures — not just banners — for every consumer that never called
 * setVerbose. Nothing is lost by leaving it alone: openjph's noise is INFO and
 * WARN, and ojph_message.cpp points both of those at stdout (only OJPH_ERROR
 * uses stderr). So emscripten's default printErr — an unconditional
 * console.error — stays in place for the messages that matter.
 *
 * It also takes console I/O out of the decode path for consumers, which is
 * worth having on its own. It is NOT, however, what the dicom-codec dispatch
 * benchmark measures: this override was once thought to explain CodSpeed's
 * -25% Simulation result on "HTJ2K Lossless (.201)", and removing it entirely
 * was measured at 189.0ms against 188.1ms with it — no effect. Whatever that
 * regression is, it is not this. Do not re-add that claim without a bench run
 * behind it. packages/openjphjs/bench/decode.bench.js overrides the same hook
 * as a no-op, for its own reasons.
 *
 * MUST return a fresh object per codec. Emscripten's MODULARIZE wrapper takes
 * the argument as its Module and mutates it in place — heap views, embind
 * registrations, the lot. Sharing one object across codecs replays the first
 * codec's registrations into the second, which fails as
 * "Cannot register public name 'getVersion' twice".
 */
function emscriptenModuleOverrides() {
  return {
    print: (message) => logger.log(message),
  };
}

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
      codecModule(emscriptenModuleOverrides()).then((codec) => {
        setCodec(codecConfig, encoderName, decoderName, codec);
        resolve(true);
      }, reject);
    } else if (codecWasmModule) {
      codecWasmModule(emscriptenModuleOverrides()).then((codec) => {
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
    return processCallback(context);
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
