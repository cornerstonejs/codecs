// Copyright (c) Chris Hafey.
// SPDX-License-Identifier: MIT

let openjphjs = require("../../dist/openjphjs.js")
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const rawPath = path.resolve(__dirname, "../fixtures/raw/CT1.RAW")
const frameInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
  isSigned: true,
  isUsingColorTransform: false,
}

function encodeFrame(openjph, rawBytes, imageFrame, options = {}) {
  const encoder = new openjph.HTJ2KEncoder()
  const decodedBytes = encoder.getDecodedBuffer(imageFrame)
  decodedBytes.set(rawBytes)

  if (typeof options.lossless === "boolean") {
    encoder.setQuality(options.lossless, options.quantizationStep || 0)
  }

  encoder.encode()
  const encoded = Uint8Array.from(encoder.getEncodedBuffer())
  encoder.delete()
  return encoded
}

function decodeFrame(openjph, encodedBytes) {
  const decoder = new openjph.HTJ2KDecoder()
  const encodedBuffer = decoder.getEncodedBuffer(encodedBytes.length)
  encodedBuffer.set(encodedBytes)
  decoder.decode()
  const decoded = Uint8Array.from(decoder.getDecodedBuffer())
  const decodedFrameInfo = decoder.getFrameInfo()
  decoder.delete()
  return { decoded, decodedFrameInfo }
}

function meanAbsoluteErrorI16(originalBytes, decodedBytes) {
  assert.strictEqual(
    decodedBytes.length,
    originalBytes.length,
    "Decoded byte length mismatch"
  )

  const original = new Int16Array(
    originalBytes.buffer,
    originalBytes.byteOffset,
    originalBytes.byteLength / Int16Array.BYTES_PER_ELEMENT
  )
  const decoded = new Int16Array(
    decodedBytes.buffer,
    decodedBytes.byteOffset,
    decodedBytes.byteLength / Int16Array.BYTES_PER_ELEMENT
  )

  let absoluteErrorSum = 0
  for (let i = 0; i < original.length; i++) {
    absoluteErrorSum += Math.abs(original[i] - decoded[i])
  }

  return absoluteErrorSum / original.length
}

function runLossyRoundTripTest(openjph, rawBytes) {
  const encodedLossy = encodeFrame(openjph, rawBytes, frameInfo, {
    lossless: false,
    quantizationStep: 8,
  })
  const { decoded, decodedFrameInfo } = decodeFrame(openjph, encodedLossy)
  const mae = meanAbsoluteErrorI16(rawBytes, decoded)

  assert.strictEqual(decodedFrameInfo.width, frameInfo.width)
  assert.strictEqual(decodedFrameInfo.height, frameInfo.height)
  console.log(`Heavy lossy round-trip MAE: ${mae.toFixed(2)}`)
  assert.ok(mae < 1500, `Heavy lossy MAE too large: ${mae}`)
}

function runTruncatedLosslessDecodeTest(openjph, rawBytes) {
  const encodedLossless = encodeFrame(openjph, rawBytes, frameInfo, {
    lossless: true,
    quantizationStep: 0,
  })
  const truncatedSize = Math.min(10 * 1024, encodedLossless.length)
  const truncatedBitstream = encodedLossless.slice(0, truncatedSize)
  const { decoded, decodedFrameInfo } = decodeFrame(openjph, truncatedBitstream)
  assert.ok(
    decoded.length > 0,
    `Expected a minimally decodable image from ${truncatedSize} bytes`
  )
  const mae = meanAbsoluteErrorI16(rawBytes, decoded)

  assert.strictEqual(decodedFrameInfo.width, frameInfo.width)
  assert.strictEqual(decodedFrameInfo.height, frameInfo.height)
  console.log(
    `Truncated lossless decode MAE (${truncatedSize} bytes kept): ${mae.toFixed(2)}`
  )
  assert.ok(mae > 10, `Expected degradation with truncated stream, MAE: ${mae}`)
  assert.ok(mae < 300, `Truncated lossless MAE too large: ${mae}`)
}

function main(openjph) {
  const rawBytes = fs.readFileSync(rawPath)
  runLossyRoundTripTest(openjph, rawBytes)
  runTruncatedLosslessDecodeTest(openjph, rawBytes)
  console.log("openjphjs node tests passed")
}

if (typeof openjphjs !== "undefined") {
  console.log("running openjphjs node tests...")
  openjphjs().then(main)
} else {
  console.warn("openjphjs isn't defined")
}
