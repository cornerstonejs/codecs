function decode(decoder, encodedBitStream, iterations=1) {
    const encodedBuffer = decoder.getEncodedBuffer(encodedBitStream.length)
    encodedBuffer.set(encodedBitStream)
  
    const beginDecode = process.hrtime();
    for(let i=0; i < iterations; i++) {
      decoder.decode()
    }

    const decodeDuration = process.hrtime(beginDecode); // hrtime returns seconds/nanoseconds tuple
    const decodeDurationInSeconds = (decodeDuration[0] + (decodeDuration[1] / 1000000000));
    const decodeTimeMS = ((decodeDurationInSeconds / iterations * 1000))
    const frameInfo = decoder.getFrameInfo()
    const pixels = decoder.getDecodedBuffer()
  
    return {
      frameInfo,
      pixels,
      decodeTimeMS
    }
}

function encode(encoder, uncompressedImageFrame, imageFrame, iterations = 1) {
  const decodedBytes = encoder.getDecodedBuffer(imageFrame);
  decodedBytes.set(uncompressedImageFrame);

  const encodeBegin = process.hrtime();
  for(let i=0; i < iterations;i++) {
    encoder.encode();
  }

  const encodeDuration = process.hrtime(encodeBegin);
  const encodeDurationInSeconds = (encodeDuration[0] + (encodeDuration[1] / 1000000000));
  const encodeTimeMS = ((encodeDurationInSeconds / iterations * 1000))
  const encodedBytes = encoder.getEncodedBuffer();

  return {
    encodedBytes,
    encodeTimeMS
  }
}

module.exports = {
    decode,
    encode
}