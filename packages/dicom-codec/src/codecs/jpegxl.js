const codecFactory = require("./codecFactory");
const { isNode } = require("browser-or-node");

/**
 * JPEG XL has no signed integer sample type. JxlDataType is UINT8, UINT16,
 * FLOAT or FLOAT16, and JxlBasicInfo describes integer samples only as
 * `bits_per_sample` with `exponent_bits_per_sample == 0` — unsigned. So
 * PixelRepresentation cannot be carried in the codestream, even though
 * PS3.5 8.2.15 allows it to be 1 for monochrome JPEG XL images and says the
 * bit stream's own characteristics are what a decoder shall use. The standard
 * defines no mechanism for the difference, so the mapping is a convention
 * between encoder and decoder, and this module has to pick one.
 *
 * It picks per transfer syntax, because the two syntaxes want different
 * things and the decoder has to be able to invert whatever the encoder did
 * knowing only the transfer syntax — not the options the encode was run with.
 *
 * PASSTHROUGH (.110 JPEG XL Lossless, and .111 which is unsigned by
 *   definition). The two's complement bits are handed to libjxl as unsigned
 *   and come back identical, so the frame round trips byte for byte and the
 *   caller's PixelRepresentation reinterprets it. Nothing is altered, the
 *   syntax's "preserves the bits of the original image" promise holds
 *   literally, and any other reader that applies PixelRepresentation itself
 *   agrees with us.
 *
 * OFFSET_BINARY (.112 JPEG XL, potentially lossy). Passthrough is unusable
 *   here: as unsigned, a CT frame's [-2048, 1704] becomes [0, 1704] plus
 *   [63488, 65535], and lossy coding smears across the ~62000-count cliff
 *   between them. Measured on a real CT slice at distance 1.0 — nominally
 *   visually lossless — that is 2211 HU of maximum error against a total
 *   range of 3752. So signed samples are shifted up by half the sample range
 *   before encoding and shifted back after decoding, which is the same level
 *   shift JPEG and JPEG 2000 apply, and what JpegXLEncoder::validate() means
 *   when it says signed samples must be offset into unsigned range by the
 *   caller.
 *
 *   The shift is applied for every signed .112 frame, lossless option or not,
 *   so that decode can invert it from the transfer syntax alone.
 *
 *   The cost is that a .112 stream of signed data written here reads 2^(n-1)
 *   too high in a decoder that assumes two's complement. Nothing in the
 *   standard distinguishes the two conventions; the alternative was emitting
 *   frames that are quietly destroyed.
 *
 * The same problem, for the same reason, exists in JPEG-LS: pydicom's
 * encoding guide documents the identical wraparound and warns against lossy
 * JPEG-LS on signed data. This repo's own jpegls.js pins setNearLossless(0)
 * rather than face it.
 */
const PASSTHROUGH = "passthrough";
const OFFSET_BINARY = "offset-binary";

/**
 * Butteraugli distance used when a caller opts out of lossless without saying
 * how lossy. libjxl's own default is 0.0, which it treats as mathematically
 * lossless but reaches through VarDCT rather than the modular path — bigger
 * than a real lossless encode (245685 vs 193274 bytes on a CT slice here) and
 * still not lossless once the sample mapping above is in play. 1.0 is cjxl's
 * default and the usual "visually lossless" setting.
 */
const DEFAULT_DISTANCE = 1.0;

const bytesPerSample = (bitsPerSample) => (bitsPerSample <= 8 ? 1 : 2);

const asBytes = (typedArray) =>
  typedArray instanceof Uint8Array
    ? typedArray
    : new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);

/**
 * Shifts signed samples up into unsigned range, returning a new buffer.
 * DataView rather than a typed-array view because the caller's frame may sit
 * at an odd byteOffset, which Int16Array cannot address.
 */
function toOffsetBinary(imageFrame, bitsPerSample) {
  const bytes = asBytes(imageFrame);
  const offset = 2 ** (bitsPerSample - 1);
  const out = new Uint8Array(bytes.byteLength);

  if (bytesPerSample(bitsPerSample) === 1) {
    for (let i = 0; i < bytes.length; i++) {
      out[i] = ((bytes[i] << 24) >> 24) + offset;
    }
    return out;
  }

  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const target = new DataView(out.buffer);
  for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
    target.setUint16(i, source.getInt16(i, true) + offset, true);
  }
  return out;
}

/** Inverse of toOffsetBinary, in place — the frame is already a private copy. */
function fromOffsetBinary(imageFrame, bitsPerSample) {
  const bytes = asBytes(imageFrame);
  const offset = 2 ** (bitsPerSample - 1);

  if (bytesPerSample(bitsPerSample) === 1) {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (bytes[i] - offset) & 0xff;
    }
    return imageFrame;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
    view.setInt16(i, view.getUint16(i, true) - offset, true);
  }
  return imageFrame;
}

async function loadDecoder() {
  const module = await import("@cornerstonejs/codec-libjxl/decodewasmjs");
  return module.default(getModuleOptions("@cornerstonejs/codec-libjxl/decodewasm"));
}

async function loadEncoder() {
  const module = await import("@cornerstonejs/codec-libjxl/encodewasmjs");
  return module.default(getModuleOptions("@cornerstonejs/codec-libjxl/encodewasm"));
}

function getModuleOptions(wasmModule) {
  if (!isNode) {
    return {};
  }

  const nodeRequire = eval("require");
  const fs = nodeRequire("fs");
  return { wasmBinary: fs.readFileSync(nodeRequire.resolve(wasmModule)) };
}

/**
 * Builds the codec module for one JPEG XL transfer syntax.
 *
 * @param {string} signedSamples PASSTHROUGH or OFFSET_BINARY, see above.
 */
function createJpegXLCodec(signedSamples) {
  const decoderWrapper = {
    codec: undefined,
    Decoder: undefined,
    Encoder: undefined,
    encoderName: "",
    decoderName: "JpegXLDecoder",
  };

  const encoderWrapper = {
    codec: undefined,
    Decoder: undefined,
    Encoder: undefined,
    encoderName: "JpegXLEncoder",
    decoderName: "",
  };

  const shiftsSigned = (imageInfo) =>
    signedSamples === OFFSET_BINARY && Boolean(imageInfo.isSigned);

  async function decode(imageFrame, imageInfo) {
    return codecFactory.runProcess(
      decoderWrapper,
      loadDecoder,
      null,
      decoderWrapper.decoderName,
      (context) => {
        const result = codecFactory.decode(
          context,
          decoderWrapper,
          imageFrame,
          imageInfo
        );

        // The decoder always reports isSigned false — JPEG XL cannot say
        // otherwise — so PixelRepresentation comes back from the data set.
        if (shiftsSigned(imageInfo)) {
          fromOffsetBinary(result.imageFrame, result.imageInfo.bitsPerSample);
        }

        result.imageInfo.signed = imageInfo.signed;
        result.imageInfo.isSigned = imageInfo.isSigned;
        result.imageInfo.pixelRepresentation = imageInfo.pixelRepresentation;
        return result;
      }
    );
  }

  async function encode(imageFrame, imageInfo, options = {}) {
    return codecFactory.runProcess(
      encoderWrapper,
      loadEncoder,
      null,
      encoderWrapper.encoderName,
      (context) => {
        function beforeEncode(encoderInstance) {
          const { lossless = true, distance, effort, decodingSpeed } = options;

          encoderInstance.setLossless(lossless);
          if (distance !== undefined) {
            encoderInstance.setDistance(distance);
          } else if (!lossless) {
            encoderInstance.setDistance(DEFAULT_DISTANCE);
          }
          if (effort !== undefined) {
            encoderInstance.setEffort(effort);
          }
          if (decodingSpeed !== undefined) {
            encoderInstance.setDecodingSpeed(decodingSpeed);
          }
        }

        // isSigned is always false to the encoder, which rejects true. Under
        // OFFSET_BINARY that is now honest rather than a reinterpretation:
        // the samples handed over really are unsigned.
        const codecImageInfo = Object.assign({}, imageInfo, { isSigned: false });
        const samples = shiftsSigned(imageInfo)
          ? toOffsetBinary(imageFrame, imageInfo.bitsPerSample)
          : imageFrame;

        const result = codecFactory.encode(
          context,
          encoderWrapper,
          samples,
          codecImageInfo,
          Object.assign({}, options, { beforeEncode })
        );

        result.imageInfo.signed = imageInfo.signed;
        result.imageInfo.isSigned = imageInfo.isSigned;
        return result;
      }
    );
  }

  function encodeLossless(imageFrame, imageInfo, options = {}) {
    return encode(
      imageFrame,
      imageInfo,
      Object.assign({}, options, { lossless: true })
    );
  }

  function getPixelData(imageFrame, imageInfo) {
    return codecFactory.getPixelData(imageFrame, imageInfo);
  }

  return { decode, encode, encodeLossless, getPixelData };
}

async function encodeJpegRecompression() {
  throw new Error(
    "JPEG XL JPEG Recompression encoding is not supported by the pixel encoder"
  );
}

const passthrough = createJpegXLCodec(PASSTHROUGH);
const offsetBinary = createJpegXLCodec(OFFSET_BINARY);

/** 1.2.840.10008.1.2.4.110 — JPEG XL Lossless. */
exports.lossless = Object.assign({}, passthrough, {
  encode: passthrough.encodeLossless,
});

/** 1.2.840.10008.1.2.4.111 — JPEG XL JPEG Recompression (decode only here). */
exports.jpegRecompression = Object.assign({}, passthrough, {
  encode: encodeJpegRecompression,
});

/** 1.2.840.10008.1.2.4.112 — JPEG XL, potentially lossy. */
exports.lossy = offsetBinary;
