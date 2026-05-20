// Production-representative decoder/encoder reuse pattern: one shared
// J2KDecoder/Encoder per codec, warmed up at module scope (untimed),
// then every per-fixture bench refills the input buffer and calls the
// kernel on the shared instance — mirroring how a real app drives
// OpenJPEG across many frames.
//
// The warmup decode/encode is critical: under CodSpeed each bench body
// runs exactly once, and the first call into a fresh wasm decoder pays
// cold cost (allocator placement, JIT). Warming up at module scope
// flattens that asymmetry so every measured bench sees a hot decoder.
//
// A separate "instantiate+destroy" bench measures the per-instance
// lifecycle cost in isolation. openjpeg encode CT1.RAW had the worst
// variance in the suite under the old conflated bench (110% spread
// across 3 runs); this split is the fix.

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
let decoder
let encoder
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decoder = new codec.J2KDecoder()
  decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
  decoder.decode() // warmup

  encoder = new codec.J2KEncoder()
  encoder.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
  encoder.encode() // warmup
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

  bench("decode CT1.j2k (.90 lossless 5-3, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()
  })

  bench("decode CT2.j2k (.90 lossless 5-3, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()
  })

  bench("decode CT-512x512-lossy.j2k (.91 irreversible 9-7) — reused decoder", () => {
    decoder.getEncodedBuffer(ctLossy.length).set(ctLossy)
    decoder.decode()
  })

  bench("encode CT1.RAW (lossless) — reused encoder", () => {
    encoder.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    encoder.encode()
  })
})
