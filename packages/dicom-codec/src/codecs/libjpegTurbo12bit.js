const local = {
  // assign it and prevent initialization
  codec: undefined,
  Decoder: undefined,
  Encoder: undefined,
  decoderName: "codec libjpeg turbo 12bit",
  encoderName: "codec libjpeg turbo 12bit",
};

async function decode(compressedImageFrame, previousImageInfo) {
  throw Error("Decoder not found for codec:" + local.encoderName);
}

async function encode(uncompressedImageFrame, previousImageInfo, options = {}) {
  throw Error("Encoder not found for codec:" + local.encoderName);
}

function getPixelData(imageFrame, frameInfo) {
  throw Error(
    "GetPixel not found or not applied for codec:" + local.encoderName
  );
}

exports.decode = decode;
exports.encode = encode;
exports.getPixelData = getPixelData;
