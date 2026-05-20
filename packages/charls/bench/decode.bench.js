// Production-representative decoder/encoder reuse pattern: one shared
// JpegLSDecoder/Encoder per codec, warmed up at module scope (untimed),
// then every per-fixture bench refills the input buffer and calls the
// kernel on the shared instance — mirroring how a real app drives
// CharLS across many frames.
//
// The warmup decode/encode is critical: under CodSpeed each bench body
// runs exactly once, and the first call into a fresh wasm decoder pays
// cold cost (allocator placement, JIT). Warming up at module scope
// flattens that asymmetry so every measured bench sees a hot decoder.
//
// A separate "instantiate+destroy" bench measures the per-instance
// lifecycle cost in isolation.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "charlswasm.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT1.JLS")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT2.JLS")) : null
const ct2Raw = !skip ? readFileSync(resolve(fixturesDir, "CT2.RAW")) : null
const ctNearLossless = !skip
  ? readFileSync(resolve(fixturesDir, "CT-512x512-near-lossless.JLS"))
  : null

const encoderImageInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
}

let codec
let decoder
let encoder
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decoder = new codec.JpegLSDecoder()
  decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
  decoder.decode() // warmup

  encoder = new codec.JpegLSEncoder()
  encoder.getDecodedBuffer(encoderImageInfo).set(ct2Raw)
  encoder.setNearLossless(0)
  encoder.encode() // warmup
}

describe.skipIf(skip)("charls JPEG-LS (wasm)", () => {
  bench("instantiate+destroy JpegLSDecoder", () => {
    const d = new codec.JpegLSDecoder()
    d.delete()
  })

  bench("instantiate+destroy JpegLSEncoder", () => {
    const e = new codec.JpegLSEncoder()
    e.delete()
  })

  bench("decode CT1.JLS (.80 lossless, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()
  })

  bench("decode CT2.JLS (.80 lossless, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()
  })

  bench("decode CT-512x512-near-lossless.JLS (.81 near-lossless) — reused decoder", () => {
    decoder.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)
    decoder.decode()
  })

  bench("encode CT2.RAW (lossless near=0) — reused encoder", () => {
    encoder.getDecodedBuffer(encoderImageInfo).set(ct2Raw)
    encoder.setNearLossless(0)
    encoder.encode()
  })
})
