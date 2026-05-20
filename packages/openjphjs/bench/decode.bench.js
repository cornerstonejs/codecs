// Production-representative decoder/encoder reuse pattern: one shared
// HTJ2KDecoder/Encoder per codec, warmed up at module scope (untimed),
// then every per-fixture bench refills the input buffer and calls the
// kernel on the shared instance — mirroring how a real app drives
// OpenJPH across many frames.
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
let decoder
let encoder
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decoder = new codec.HTJ2KDecoder()
  decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
  decoder.decode() // warmup

  encoder = new codec.HTJ2KEncoder()
  encoder.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
  encoder.encode() // warmup
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

  bench("decode CT1.j2c (.201 lossless, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()
  })

  bench("decode CT2.j2c (.201 lossless, 512x512x16bit) — reused decoder", () => {
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()
  })

  bench("encode CT1.RAW (HTJ2K lossless) — reused encoder", () => {
    encoder.getDecodedBuffer(encoderImageInfo).set(ct1Raw)
    encoder.encode()
  })
})
