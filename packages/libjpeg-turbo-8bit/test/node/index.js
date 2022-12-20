// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

let libjpegturbojs = require("../../dist/libjpegturbojs.js")
let libjpegturbowasm = require("../../dist/libjpegturbowasm.js")

const fs = require("fs")

function decode(
  libjpegturbo,
  encodedImagePath,
  rawImagePath,
  iterations = 1
) {
  encodedBitStream = fs.readFileSync(encodedImagePath)
  const numBytes = 0
  encodedBitStream = encodedBitStream.slice(
    0,
    encodedBitStream.length - numBytes
  )
  console.log("encodedBitStream.length=", encodedBitStream.length)
  const decoder = new libjpegturbo.JPEGDecoder()
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
  var decoded = decoder.getDecodedBuffer()
  console.log("  decoded length = ", decoded.length)

  if (rawImagePath) {
    fs.writeFileSync(rawImagePath, decoded)
  }
  decoder.delete()
}

function encode(
  openjpeg,
  pathToUncompressedImageFrame,
  imageFrame,
  pathToJ2CFile,
  iterations = 1
) {
  const uncompressedImageFrame = fs.readFileSync(pathToUncompressedImageFrame)
  console.log("uncompressedImageFrame.length:", uncompressedImageFrame.length)
  const encoder = new openjpeg.JPEGEncoder()
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
    fs.writeFileSync(pathToJ2CFile, encodedBytes)
  }
  // cleanup allocated memory
  encoder.delete()
}

//decode('../fixtures/j2k/CT1.j2k');
//decode('../fixtures/j2k/CT1.j2k');

function main(libjpegturbo) {
  //decode(libjpegturbo, '../../extern/libjpeg-turbo/testimages/testimgari.jpg', 1);
  //decode(libjpegturbo, '../../extern/libjpeg-turbo/testimages/testorig12.jpg', 1);
  //decode(libjpegturbo, '../fixtures/jpeg/lossless/CT1.jpll', '../fixtures/raw/CT1.raw', 1);
  decode(
    libjpegturbo,
    "../fixtures/jpeg/jpeg400jfif.jpg",
    "../fixtures/raw/jpeg400jfif.raw",
  )

  //decode('../fixtures/j2k/CT1-0decomp.j2k');
  //decode('../fixtures/j2k/NM1.j2k');
  //decode(libjpegturbo, '../fixtures/jpeg/lossless/CT1_JPLL', 1);
  //decode('../fixtures/j2k/image.j2k');
  //decode('../../extern/OpenJPH/subprojects/js/html/test.j2c');

  encode(
    libjpegturbo,
    "../fixtures/raw/jpeg400jfif.raw",
    {
      width: 600,
      height: 800,
      bitsPerSample: 8,
      componentCount: 1,
      isSigned: false,
    },
    "../fixtures/jpeg/jpeg400jfif-new.jpg",
  )

  //encode(libjpegturbo, '../fixtures/raw/CT1.RAW', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, '../fixtures/j2k/CT1-new.j2k');
  //encode('../fixtures/raw/CT2.RAW', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, '../fixtures/j2c/CT2.j2c');
  //encode('../fixtures/raw/MG1.RAW', {width: 3064, height: 4774, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/MG1.j2c');
  //encode('../fixtures/raw/MR1.RAW', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, '../fixtures/j2c/MR1.j2c');
  //encode('../fixtures/raw/MR2.RAW', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/MR2.j2c');
  //encode('../fixtures/raw/MR3.RAW', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, '../fixtures/j2c/MR3.j2c');
  //encode('../fixtures/raw/MR4.RAW', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/MR4.j2c');
  //encode('../fixtures/raw/NM1.RAW', {width: 256, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: true}, '../fixtures/j2c/NM1.j2c');
  //encode('../fixtures/raw/RG1.RAW', {width: 1841, height: 1955, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/RG1.j2c');
  //encode('../fixtures/raw/RG1.RAW', {width: 1841, height: 1955, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/RG1.j2c');
  //encode('../fixtures/raw/RG2.RAW', {width: 1760, height: 2140, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/RG2.j2c');
  //encode('../fixtures/raw/RG3.RAW', {width: 1760, height: 1760, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/RG3.j2c');
  //encode('../fixtures/raw/SC1.RAW', {width: 2048, height: 2487, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/SC1.j2c');
  //encode('../fixtures/raw/XA1.RAW', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, '../fixtures/j2c/XA1.j2c');
}

if (libjpegturbojs) {
  console.log("testing libjpegturbojs...")
  libjpegturbojs().then(function (libjpegturbo) {
    main(libjpegturbo)
  })
}

if (typeof libjpegturbowasm !== "undefined") {
  console.log("testing libjpegturbowasm...")
  libjpegturbowasm().then(function (libjpegturbo) {
    main(libjpegturbo)
  })
}
