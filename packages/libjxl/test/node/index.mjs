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
  console.log("WASM-decode  ", imageName, result.decodeTimeMS, result.pixels.length, result.frameInfo );
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

function recodeFile(codec, imageName, imageFrame, iterations = 1) {
  const pathToUncompressedImageFrame = '../fixtures/raw/' + imageName + ".RAW"
  const uncompressedImageFrame = fs.readFileSync(pathToUncompressedImageFrame);
  for(let iteration = 0; iteration < iterations; iteration++) {
    //encoder.setQuality(false, 0.001);
  const encoder = new codec.JpegXLEncoder();
  const decoder = new codec.JpegXLDecoder()
    const result = codecHelper.encode(encoder, uncompressedImageFrame, imageFrame, 1)
    const { encodedBytes } = result;
    console.log("WASM-recode  ", imageName, encodedBytes.length, imageFrame);
    const decodeResult = codecHelper.decode(decoder, encodedBytes, 1)
    console.log("WASM-recode  ", imageName, decodeResult.frameInfo, decodeResult.pixels.length);
    if( decodeResult.pixels.length!==uncompressedImageFrame.length ) {
      throw new Error(`Expected original (${uncompressedImageFrame.length}) and recoded lengths (${decodeResult.pixels.length}) to be the same`);
    }
    encoder.delete();
    decoder.delete();
  }
}

function main(codec) {
  console.log("Starting main");
  const iterations = (process.argv.length > 2) ? parseInt(process.argv[2]) : 1
  decodeFile(codec, 'MG1', iterations);
  recodeFile(codec, "VL1", {width: 756, height: 486, bitsPerSample: 8, componentCount: 3}, iterations);
  recodeFile(codec, "VL2", {width: 756, height: 486, bitsPerSample: 8, componentCount: 3}, iterations);
  recodeFile(codec, "VL3", {width: 756, height: 486, bitsPerSample: 8, componentCount: 3}, iterations);
  recodeFile(codec, "VL4", {width: 2226, height: 1868, bitsPerSample: 8, componentCount: 3}, iterations);
  recodeFile(codec, "VL5", {width: 2670, height: 3340, bitsPerSample: 8, componentCount: 3}, iterations);
  recodeFile(codec, "VL6", {width: 756, height: 486, bitsPerSample: 8, componentCount: 3}, iterations);
  
  recodeFile(codec, 'MG1', {width: 3064, height: 4774, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'CT1', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations)
  recodeFile(codec, 'CT1', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations)
  recodeFile(codec, 'CT2', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  recodeFile(codec, 'MR1', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  recodeFile(codec, 'MR2', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'MR3', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  recodeFile(codec, 'MR4', {width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'NM1', {width: 256, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: true}, iterations);
  recodeFile(codec, 'RG1', {width: 1841, height: 1955, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'RG2', {width: 1760, height: 2140, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'RG3', {width: 1760, height: 1760, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'SC1', {width: 2048, height: 2487, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
  recodeFile(codec, 'XA1', {width: 1024, height: 1024, bitsPerSample: 16, componentCount: 1, isSigned: false}, iterations);
}

// libjxljs.default.onRuntimeInitialized = async _ => {
//     console.log("Starting to run tests");
//     main(libjxljs);
// }

libjxljs.default().then(loaded => main(loaded))

