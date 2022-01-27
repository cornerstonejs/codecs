/**
 * @type {CodecWrapper}
 */
const codecWrapper = {
  // assign it and prevent initialization
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "codec libjpeg turbo 12bit",
  encoderName: "codec libjpeg turbo 12bit",
};

async function decode(imageFrame, imageInfo) {
  throw Error("Decoder not found for codec:" + codecWrapper.encoderName);
}

async function encode(imageFrame, imageInfo, options = {}) {
  throw Error("Encoder not found for codec:" + codecWrapper.encoderName);
}

function getPixelData(imageFrame, imageInfo) {
  throw Error(
    "GetPixel not found or not applied for codec:" + codecWrapper.encoderName
  );
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
