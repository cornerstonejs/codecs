// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

let openjphjs = require("../../dist/openjphjs.js")
const fs = require("fs")

function decode(openjph, encodedImagePath, iterations = 100) {
  const encodedBitStream = fs.readFileSync(encodedImagePath)
  const decoder = new openjph.HTJ2KDecoder()
  const encodedBuffer = decoder.getEncodedBuffer(encodedBitStream.length)
  encodedBuffer.set(encodedBitStream)

  // do the actual benchmark
  const beginDecode = process.hrtime()
  for (var i = 0; i < iterations; i++) {
    decoder.decode()
  }
  const decodeDuration = process.hrtime(beginDecode) // hrtime returns seconds/nanoseconds tuple
  const decodeDurationInSeconds =
    decodeDuration[0] + decodeDuration[1] / 1000000000

  // Print out information about the decode
  console.log(
    "Decode of " +
      encodedImagePath +
      " took " +
      (decodeDurationInSeconds / iterations) * 1000 +
      " ms"
  )
  const frameInfo = decoder.getFrameInfo()
  console.log("  frameInfo = ", frameInfo)
  console.log(" imageOffset = ", decoder.getImageOffset())
  var decoded = decoder.getDecodedBuffer()
  console.log("  decoded length = ", decoded.length)

  decoder.delete()
}

function encode(
  openjph,
  pathToUncompressedImageFrame,
  imageFrame,
  pathToJ2CFile,
  iterations = 100
) {
  const uncompressedImageFrame = fs.readFileSync(pathToUncompressedImageFrame)
  console.log("uncompressedImageFrame.length:", uncompressedImageFrame.length)
  const encoder = new openjph.HTJ2KEncoder()
  const decodedBytes = encoder.getDecodedBuffer(imageFrame)
  decodedBytes.set(uncompressedImageFrame)
  //encoder.setQuality(false, 0.001);

  const encodeBegin = process.hrtime()
  for (var i = 0; i < iterations; i++) {
    encoder.encode()
  }
  const encodeDuration = process.hrtime(encodeBegin)
  const encodeDurationInSeconds =
    encodeDuration[0] + encodeDuration[1] / 1000000000

  // print out information about the encode
  console.log(
    "Encode of " +
      pathToUncompressedImageFrame +
      " took " +
      (encodeDurationInSeconds / iterations) * 1000 +
      " ms"
  )
  const encodedBytes = encoder.getEncodedBuffer()
  console.log("  encoded length=", encodedBytes.length)

  if (pathToJ2CFile) {
    //fs.writeFileSync(pathToJ2CFile, encodedBytes);
  }
  // cleanup allocated memory
  encoder.delete()
}

function main(openjph) {
  decode(openjph, "../fixtures/j2c/CT2.j2c")
  decode(openjph, "../../extern/OpenJPH/subprojects/js/html/test.j2c")

  encode(
    openjph,
    "../fixtures/raw/CT1.RAW",
    {
      width: 512,
      height: 512,
      bitsPerSample: 16,
      componentCount: 1,
      isSigned: true,
    },
    "../fixtures/j2c/CT1.j2c"
  )
}

if (typeof openjphjs !== "undefined") {
  console.log("testing openjphjs...")
  openjphjs().then(function (openjphwasm) {
    main(openjphwasm)
  })
}
