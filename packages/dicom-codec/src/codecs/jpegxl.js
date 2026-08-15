const codecFactory = require("./codecFactory");
const { isNode } = require("browser-or-node");

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
        const {
          lossless = true,
          distance,
          effort,
          decodingSpeed,
        } = options;

        encoderInstance.setLossless(lossless);
        if (distance !== undefined) {
          encoderInstance.setDistance(distance);
        }
        if (effort !== undefined) {
          encoderInstance.setEffort(effort);
        }
        if (decodingSpeed !== undefined) {
          encoderInstance.setDecodingSpeed(decodingSpeed);
        }
      }

      const codecImageInfo = Object.assign({}, imageInfo, { isSigned: false });
      const result = codecFactory.encode(
        context,
        encoderWrapper,
        imageFrame,
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

async function encodeJpegRecompression() {
  throw new Error(
    "JPEG XL JPEG Recompression encoding is not supported by the pixel encoder"
  );
}

function getPixelData(imageFrame, imageInfo) {
  return codecFactory.getPixelData(imageFrame, imageInfo);
}

exports.decode = decode;
exports.encode = encode;
exports.encodeLossless = encodeLossless;
exports.encodeJpegRecompression = encodeJpegRecompression;
exports.getPixelData = getPixelData;
