import codecHelper from "./codec-helper.js";
import fs from "fs";

// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT
console.log("Running tests for libjxl.js");
let libjxljs = await import('../../dist/libjxljs.js');

function decodeFile(codec, imageName, iterations = 1) {
  const encodedImagePath = '../fixtures/jxl/' + imageName + ".jxl"
  const encodedBitStream = fs.readFileSync(encodedImagePath)
  const decoder = new codec.JpegXLDecoder()
  const result = codecHelper.decode(decoder, encodedBitStream, iterations)
  console.log("WASM-decode   " + imageName + " " +  result.decodeTimeMS);
  decoder.delete();
  return result
}

function encodeFile(codec, imageName, imageFrame, iterations = 1) {
  const pathToUncompressedImageFrame = '../fixtures/raw/' + imageName + ".RAW"
  const uncompressedImageFrame = fs.readFileSync(pathToUncompressedImageFrame);
  const encoder = new codec.JpegXLEncoder();
  //encoder.setQuality(false, 0.001);
  const result = codecHelper.encode(encoder, uncompressedImageFrame, imageFrame, iterations)
  console.log("WASM-encode   " + imageName + " " +  result.encodeTimeMS);
  encoder.delete();
  return result
}

function main(codec) {
  console.log("Starting main");
  const iterations = (process.argv.length > 2) ? parseInt(process.argv[2]) : 1
  encodeFile(codec, 'CT1', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations)
  encodeFile(codec, 'CT2', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  encodeFile(codec, 'MG1', {width: 3064, height: 4774, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'MR1', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  encodeFile(codec, 'MR2', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'MR3', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  encodeFile(codec, 'MR4', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'NM1', {width: 256, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  encodeFile(codec, 'RG1', {width: 1841, height: 1955, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'RG2', {width: 1760, height: 2140, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'RG3', {width: 1760, height: 1760, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'SC1', {width: 2048, height: 2487, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  encodeFile(codec, 'XA1', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  decodeFile(codec, 'CT1', iterations)
  decodeFile(codec, 'CT2', iterations)
  decodeFile(codec, 'MG1', iterations)
  decodeFile(codec, 'MR1', iterations)
  decodeFile(codec, 'MR2', iterations)
  decodeFile(codec, 'MR3', iterations)
  decodeFile(codec, 'MR4', iterations)
  decodeFile(codec, 'NM1', iterations)
  decodeFile(codec, 'RG1', iterations)
  decodeFile(codec, 'RG2', iterations)
  decodeFile(codec, 'RG3', iterations)
  decodeFile(codec, 'SC1', iterations)
  decodeFile(codec, 'XA1', iterations)
}

// libjxljs.default.onRuntimeInitialized = async _ => {
//     console.log("Starting to run tests");
//     main(libjxljs);
// }

libjxljs.default().then(loaded => main(loaded))

