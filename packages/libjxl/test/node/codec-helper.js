function decode(decoder, encodedBitStream, iterations=1) {
  const encodedBuffer = decoder.getEncodedBuffer(encodedBitStream.length)
  console.log("🚀 ~ decode ~ encodedBitStream:", encodedBitStream)
    console.log("🚀 ~ decode ~ encodedBuffer:", encodedBuffer)
    encodedBuffer.set(encodedBitStream)

    const beginDecode = process.hrtime();
    for(let i=0; i < iterations; i++) {
      decoder.decode()
    }

    const decodeDuration = process.hrtime(beginDecode); // hrtime returns seconds/nanoseconds tuple
    console.log("decodeDuration=", decodeDuration);
    const decodeDurationInSeconds = (decodeDuration[0] + (decodeDuration[1] / 1000000000));
    console.log("decodeDurationInSections", decodeDurationInSeconds, decodeDuration[0], decodeDuration[1], iterations);
    const decodeTimeMS = ((decodeDurationInSeconds / iterations * 1000))
    console.log("decodeTimeMS", decodeTimeMS);
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
  console.log("🚀 ~ encode ~ imageFrame:", imageFrame)
  console.log("🚀 ~ encode ~ decodedBytes:", decodedBytes)
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