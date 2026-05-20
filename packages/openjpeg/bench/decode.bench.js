// Cold vs warm decoder benches.
//
// "cold" = a fresh decoder/encoder instance whose first .decode()/.encode()
// call happens INSIDE the bench body. Models frame 1 of a worker
// session — cornerstone3D's decodeImageFrameWorker.js has no explicit
// warmup, so frame 1 in each worker pays this cost.
//
// "warm" = a shared decoder/encoder that has already done 5 decode/encode
// passes at module load (untimed). The bench body is the 6th+ call.
// Models frames 2..N — cornerstone3D's decodeJPEG2000.ts:68 caches the
// decoder on `local.decoder` and reuses it for every frame, so the
// dominant production case is the warm pattern.
//
// Bench bodies are symmetric (same code shape) between cold and warm —
// the only difference is module-load state, so the cold/warm delta
// isolates the cost of "first call setup" (wasm heap grow, page-touch,
// V8 tier-up) versus pure kernel time.
//
// Warmup uses CT1.j2k (the largest of the three fixtures at 174 KB)
// so the warm decoder's internal buffers never need to regrow when
// processing the smaller fixtures.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "openjpegwasm.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2k/CT1.j2k")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2k/CT2.j2k")) : null
const ct1Raw = !skip ? readFileSync(resolve(fixturesDir, "raw/CT1.RAW")) : null
const ctLossy = !skip
  ? readFileSync(resolve(fixturesDir, "j2k/CT-512x512-lossy.j2k"))
  : null

const encoderImageInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
  isSigned: true,
}

let codec
let coldDecCT1
let coldDecCT2
let coldDecLossy
let warmDec
let coldEnc
let warmEnc
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  // Cold instances: one per fixture, constructed but never decoded.
  coldDecCT1 = new codec.J2KDecoder()
  coldDecCT2 = new codec.J2KDecoder()
  coldDecLossy = new codec.J2KDecoder()
  coldEnc = new codec.J2KEncoder()

  // Warm instances: 5 untimed iterations to stabilize V8 tiering and
  // wasm heap state. Warmup uses the largest fixture (CT1).
  warmDec = new codec.J2KDecoder()
  for (let i = 0; i < 5; i++) {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  }

  warmEnc = new codec.J2KEncoder()
  for (let i = 0; i < 5; i++) {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    warmEnc.encode()
  }
}

describe.skipIf(skip)("openjpeg J2K (wasm)", () => {
  bench("instantiate+destroy J2KDecoder", () => {
    const d = new codec.J2KDecoder()
    d.delete()
  })

  bench("instantiate+destroy J2KEncoder", () => {
    const e = new codec.J2KEncoder()
    e.delete()
  })

  bench("decode CT1.j2k (.90 lossless 5-3, 512x512x16bit) — cold", () => {
    coldDecCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    coldDecCT1.decode()
  })

  bench("decode CT1.j2k (.90 lossless 5-3, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    warmDec.decode()
  })

  bench("decode CT2.j2k (.90 lossless 5-3, 512x512x16bit) — cold", () => {
    coldDecCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    coldDecCT2.decode()
  })

  bench("decode CT2.j2k (.90 lossless 5-3, 512x512x16bit) — warm", () => {
    warmDec.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    warmDec.decode()
  })

  bench("decode CT-512x512-lossy.j2k (.91 irreversible 9-7) — cold", () => {
    coldDecLossy.getEncodedBuffer(ctLossy.length).set(ctLossy)
    coldDecLossy.decode()
  })

  bench("decode CT-512x512-lossy.j2k (.91 irreversible 9-7) — warm", () => {
    warmDec.getEncodedBuffer(ctLossy.length).set(ctLossy)
    warmDec.decode()
  })

  bench("encode CT1.RAW (lossless) — cold", () => {
    coldEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    coldEnc.encode()
  })

  bench("encode CT1.RAW (lossless) — warm", () => {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    warmEnc.encode()
  })
})
