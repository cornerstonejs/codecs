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
// HTJ2K production path (dicom-codec / cornerstone codecs) reuses a single
// HTJ2KDecoder across frames. Per-frame cost ≈ decode — warm.
//
// "cold" benches still model a fresh decoder per frame for lifecycle regressions.
// "warm" benches model the reused-decoder production path.
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
  // Silence wasm stdout/stderr: HTJ2KDecoder's constructor prints a banner,
  // and vitest's console interception (stack-trace task attribution +
  // source-map mapping) would otherwise run inside the measured bench body,
  // swamping the microsecond-scale instantiate+destroy benches.
  codec = await factory({ print: () => {}, printErr: () => {} })

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
  // Lifecycle benches are batched: a single instantiate+destroy is ~60 µs,
  // small enough that fixed harness overhead (bench-wrapper frames, task
  // attribution) and the simulated cache model's CPU-to-CPU variation
  // dominate the number. 50 iterations puts the body in the ms range where
  // the codec work is the signal.
  bench("instantiate+destroy HTJ2KDecoder x50", () => {
    for (let i = 0; i < 50; i++) {
      const d = new codec.HTJ2KDecoder()
      d.delete()
    }
  })

  bench("instantiate+destroy HTJ2KEncoder x50", () => {
    for (let i = 0; i < 50; i++) {
      const e = new codec.HTJ2KEncoder()
      e.delete()
    }
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
