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
 * Copies a codec buffer out of WASM memory into a JS-owned typed array.
 *
 * The codecs' getDecodedBuffer()/getEncodedBuffer() hand back an emscripten
 * `typed_memory_view` — a live window onto the wasm heap, owned by the codec
 * instance, NOT a copy. Every way that instance can move on invalidates it:
 *
 *   - `delete()` frees the underlying vector, so the view aliases memory the
 *     allocator is free to hand to anything else;
 *   - reusing the instance (see `reuseDecoder`) overwrites the same bytes on the
 *     next decode, so a caller holding views for frames 1..n of a series would
 *     find every one of them showing frame n;
 *   - a decode that grows the heap detaches the view's ArrayBuffer outright, and
 *     reads then throw.
 *
 * So the copy is not an optimisation trade-off — returning the view is wrong in
 * all three cases. It costs one memcpy of the frame against a decode, and it is
 * what makes reuse safe.
 *
 * @param {TypedArray} typedArray a view into WASM memory.
 * @returns {TypedArray} an equivalent array backed by its own ArrayBuffer.
 */
function copyFromWasm(typedArray) {
  // slice() preserves the element type and returns a fresh buffer at offset 0,
  // which also keeps the 16-bit views getPixelData() builds correctly aligned.
  return getImageFrame(typedArray).slice();
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
  try {
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

  // Copy BEFORE delete(): see copyFromWasm. delete() frees the vector this view
  // points into, so returning the view alone hands the caller memory the wasm
  // allocator may reissue at any time.
  const encodedCopy = copyFromWasm(encodedTypedArray);

  // cleanup allocated memory
  encoderInstance.delete();

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  return {
    imageFrame: encodedCopy,
    imageInfo: getTargetImageInfo(imageInfo, imageInfo),
    processInfo,
  };
  } finally {
    // cleanup allocated memory
    encoderInstance.delete();
  }
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
 * @param {*} [options] process options.
 * @param {boolean} [options.reuseDecoder=false] keep one decoder instance on
 *   codecConfig and reuse it across calls instead of constructing and deleting
 *   one per frame. Opt-in per codec: a decoder that carries state between
 *   decodes, or whose retained buffers grow, must not set it. The returned
 *   imageFrame is copied out of WASM memory either way (see copyFromWasm), so
 *   holding frames from several decodes is safe; call releaseDecoder to give the
 *   retained heap back.
 * @returns Object containing decoded image frame and imageInfo (current) data.
 *   processInfo.partial is true when the codec parsed the header but did not
 *   finish decoding; the frame is correctly sized and the undecoded region is
 *   zero-filled.
 * @throws Will throw when the codec could not parse the codestream header, so
 *   that an unusable frame is never reported as a successful decode.
 *
 */
function decode(context, codecConfig, imageFrame, imageInfo, options = {}) {
  if (!imageFrame?.length) {
    throw new Error("Image frame not defined for decoding");
  }

  // Constructing a wasm decoder is not cheap — it allocates heap, registers
  // embind bindings and, for openjph, ran its constructor banner through the
  // console. Doing that per frame dominated series decoding: it is the bulk of
  // the gap between dispatching HTJ2K through this factory and calling
  // openjphjs directly. Reused decoders are held on codecConfig, which is the
  // per-codec singleton the wrapper modules already share.
  const reuseDecoder = options.reuseDecoder === true;
  let decoderInstance;
  if (reuseDecoder) {
    if (!codecConfig.reusedDecoder) {
      codecConfig.reusedDecoder = new codecConfig.Decoder();
    }
    decoderInstance = codecConfig.reusedDecoder;
  } else {
    decoderInstance = new codecConfig.Decoder();
  }

  try {
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

  // Copy out of WASM memory before anything can invalidate the view — the
  // delete() below, or the next decode on a reused instance. See copyFromWasm.
  const decodedCopy = copyFromWasm(decodedTypedArray);

  const decodeStatus = getDecodeStatus(decoderInstance);

  // cleanup allocated memory — except when reusing, where the whole point is
  // that this instance survives to the next call. openjphjs' decoder-reuse
  // test covers the consequence that matters: retained buffers must not make
  // successive decodes progressively slower.
  if (!reuseDecoder) {
    decoderInstance.delete();
  }

  if (decodeStatus.failed && !decodeStatus.headerValid) {
    // Nothing usable came back: the codec could not parse the header, so the
    // dimensions and the buffer are both meaningless. Decoders that swallow
    // this (openjph, so that truncated streams can degrade gracefully) would
    // otherwise have this function report success on an empty or wrongly sized
    // frame — and with a reused decoder, report it under the previous frame's
    // pixels. Throwing here is the pre-reuse behaviour for a stream that
    // genuinely cannot be decoded.
    throw new Error("Decode failed: " + decodeStatus.message);
  }

  const processInfo = {
    duration: context.timer.getDuration(),
  };

  if (decodeStatus.failed) {
    // Header parsed but the decode did not finish: a correctly sized frame
    // whose undecoded region is zero-filled. Not the truncation case — openjph
    // absorbs a short codestream as zero coefficients and calls that a success
    // (measured across every truncation length of a 185 KB fixture), so what
    // lands here is a codestream whose markers parse but whose parameters the
    // decoder rejects. Reported rather than thrown, because the frame that came
    // back is real as far as it goes; flagged, because it is not the whole image.
    processInfo.partial = true;
    processInfo.partialReason = decodeStatus.message;
    context.logger.log("Partial decode: " + decodeStatus.message);
  }

  return {
    imageFrame: decodedCopy,
    imageInfo: getTargetImageInfo(imageInfo, decodedImageInfo),
    processInfo,
  };
  } finally {
    // cleanup allocated memory
    decoderInstance.delete();
  }
}

/**
 * Reads a decoder's post-decode failure state.
 *
 * Most codecs signal a decode failure by throwing, which runProcess already
 * propagates. openjph does not: it swallows the exception so that a partial
 * codestream can degrade to a partial image, and reports the outcome through
 * getIsHeaderValid()/getLastErrorMessage() instead. Both are optional — a codec
 * that does not expose them is treated as "succeeded", which is exactly right
 * for the throw-on-failure codecs.
 *
 * @param {Object} decoderInstance codec decoder instance.
 * @returns {{failed: boolean, headerValid: boolean, message: string}}
 */
function getDecodeStatus(decoderInstance) {
  const message =
    typeof decoderInstance.getLastErrorMessage === "function"
      ? decoderInstance.getLastErrorMessage() || ""
      : "";
  const headerValid =
    typeof decoderInstance.getIsHeaderValid === "function"
      ? decoderInstance.getIsHeaderValid()
      : true;

  return { failed: message !== "", headerValid, message };
}

/**
 * Deletes the decoder a previous decode({ reuseDecoder: true }) left on
 * codecConfig, releasing the WASM heap it retains.
 *
 * A reused decoder keeps the buffers sized for the largest frame it has seen
 * for the lifetime of the module, which is the point — but a consumer that
 * decoded one very large series and is done with it has no other way to get
 * that memory back. Safe to call at any time and on a codec that never reused:
 * the next decode simply constructs a new decoder.
 *
 * @param {CodecWrapper} codecConfig codec wrapper configuration.
 * @returns {boolean} true if a decoder was released.
 */
function releaseDecoder(codecConfig) {
  if (!codecConfig?.reusedDecoder) {
    return false;
  }

  codecConfig.reusedDecoder.delete();
  codecConfig.reusedDecoder = undefined;
  return true;
}

exports.runProcess = runProcess;
exports.encode = encode;
exports.decode = decode;
exports.initialize = initialize;
exports.getPixelData = getPixelData;
exports.getTargetImageInfo = getTargetImageInfo;
exports.releaseDecoder = releaseDecoder;
