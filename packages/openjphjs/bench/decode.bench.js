// Cold vs warm decoder benches.
//
// "cold" = a fresh decoder/encoder instance whose first .decode()/.encode()
// call happens INSIDE the bench body. Models frame 1 of a worker
// session — cornerstone3D's decodeImageFrameWorker.js has no explicit
// warmup, so frame 1 in each worker pays this cost.
//
// "warm" = a shared decoder/encoder that has already done 5 decode/encode
// passes at module load (untimed). The bench body is the 6th+ call.
//
// Important caveat for HTJ2K: cornerstone3D's decodeHTJ2K.ts:69 actually
// creates a fresh `new HTJ2KDecoder()` for every frame (a comment in
// that file notes reuse is "much slower for some reason"). So for
// HTJ2K specifically, the production-cost approximation is:
//
//   per-frame cost ≈ instantiate+destroy HTJ2KDecoder + decode — cold
//
// The "warm" HTJ2K decode bench remains useful for regression detection
// on the openjph decoder kernel itself, but isn't what cornerstone3D
// actually pays per frame.
//
// Bench bodies are symmetric between cold and warm — the only difference
// is module-load state, so the cold/warm delta isolates first-call
// setup cost from pure kernel time.
//
// Warmup uses CT1.j2c (the larger of the two decode fixtures at 185 KB)
// so the warm decoder's internal buffers never need to regrow.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "openjphjs.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2c/CT1.j2c")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2c/CT2.j2c")) : null
const ct1Raw = !skip ? readFileSync(resolve(fixturesDir, "raw/CT1.RAW")) : null

const encoderImageInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
  isSigned: true,
  isUsingColorTransform: false,
}

let codec
let coldDecCT1
let coldDecCT2
let warmDec
let coldEnc
let warmEnc
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  // Cold instances: one per fixture, constructed but never decoded.
  coldDecCT1 = new codec.HTJ2KDecoder()
  coldDecCT2 = new codec.HTJ2KDecoder()
  coldEnc = new codec.HTJ2KEncoder()

  // Warm instances: 5 untimed iterations to stabilize V8 tiering and
  // wasm heap state. Warmup uses the larger fixture (CT1).
  warmDec = new codec.HTJ2KDecoder()
  for (let i = 0; i < 5; i++) {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  }

  warmEnc = new codec.HTJ2KEncoder()
  for (let i = 0; i < 5; i++) {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    warmEnc.encode()
  }
}

describe.skipIf(skip)("openjphjs HTJ2K (wasm)", () => {
  bench("instantiate+destroy HTJ2KDecoder", () => {
    const d = new codec.HTJ2KDecoder()
    d.delete()
  })

  bench("instantiate+destroy HTJ2KEncoder", () => {
    const e = new codec.HTJ2KEncoder()
    e.delete()
  })

  bench("decode CT1.j2c (.201 lossless, 512x512x16bit) — cold", () => {
    coldDecCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    coldDecCT1.decode()
  })

  bench("decode CT1.j2c (.201 lossless, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  })

  bench("decode CT2.j2c (.201 lossless, 512x512x16bit) — cold", () => {
    coldDecCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    coldDecCT2.decode()
  })

  bench("decode CT2.j2c (.201 lossless, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    warmDec.decode()
  })

  bench("encode CT1.RAW (HTJ2K lossless) — cold", () => {
    coldEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    coldEnc.encode()
  })

  bench("encode CT1.RAW (HTJ2K lossless) — warm", () => {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    warmEnc.encode()
  })
})
