// Cold vs warm decoder benches.
//
// "cold" = a fresh decoder/encoder instance whose first .decode()/.encode()
// call happens INSIDE the bench body. Models frame 1 of a worker
// session — cornerstone3D's decodeImageFrameWorker.js has no explicit
// warmup, so frame 1 in each worker pays this cost.
//
// "warm" = a shared decoder/encoder that has already done 5 decode/encode
// passes at module load (untimed). The bench body is the 6th+ call.
// Models frames 2..N in a worker session — cornerstone3D's
// decodeJPEGLS.ts:73 caches the decoder on `local.decoder` and reuses
// it for every subsequent frame, so this is the dominant production
// case.
//
// Bench bodies are symmetric (same code shape) between cold and warm —
// the only difference is module-load state, so the cold/warm delta
// isolates the cost of "first call setup" (wasm heap grow, page-touch,
// V8 tier-up) versus pure kernel time.
//
// Warmup uses CT1.JLS (the largest of the three fixtures at 164 KB)
// so the warm decoder's internal buffers never need to regrow when
// processing the smaller fixtures.
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
let coldDecCT1
let coldDecCT2
let coldDecNL
let warmDec
let coldEnc
let warmEnc
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  // Cold instances: one per fixture, constructed but never decoded.
  // The bench body will be the first decode call on this instance.
  coldDecCT1 = new codec.JpegLSDecoder()
  coldDecCT2 = new codec.JpegLSDecoder()
  coldDecNL = new codec.JpegLSDecoder()
  coldEnc = new codec.JpegLSEncoder()

  // Warm instances: 5 untimed iterations to stabilize V8 tiering and
  // wasm heap state. Warmup uses the largest fixture (CT1) so smaller
  // fixtures in the warm decode benches don't trigger a buffer regrow.
  warmDec = new codec.JpegLSDecoder()
  for (let i = 0; i < 5; i++) {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  }

  warmEnc = new codec.JpegLSEncoder()
  for (let i = 0; i < 5; i++) {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct2Raw)
    warmEnc.setNearLossless(0)
    warmEnc.encode()
  }
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

  bench("decode CT1.JLS (.80 lossless, 512x512x16bit) — cold", () => {
    coldDecCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    coldDecCT1.decode()
  })

  bench("decode CT1.JLS (.80 lossless, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  })

  bench("decode CT2.JLS (.80 lossless, 512x512x16bit) — cold", () => {
    coldDecCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    coldDecCT2.decode()
  })

  bench("decode CT2.JLS (.80 lossless, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    warmDec.decode()
  })

  bench("decode CT-512x512-near-lossless.JLS (.81 near-lossless) — cold", () => {
    coldDecNL.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)
    coldDecNL.decode()
  })

  bench("decode CT-512x512-near-lossless.JLS (.81 near-lossless) — warm", () => {
    warmDec.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)
    warmDec.decode()
  })

  bench("encode CT2.RAW (lossless near=0) — cold", () => {
    coldEnc.getDecodedBuffer(encoderImageInfo).set(ct2Raw)
    coldEnc.setNearLossless(0)
    coldEnc.encode()
  })

  bench("encode CT2.RAW (lossless near=0) — warm", () => {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct2Raw)
    warmEnc.setNearLossless(0)
    warmEnc.encode()
  })
})
