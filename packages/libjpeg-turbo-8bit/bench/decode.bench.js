// Production-representative decoder/encoder reuse pattern: one shared
// JPEGDecoder/Encoder per codec, warmed up at module scope (untimed),
// then every per-fixture bench refills the input buffer and calls the
// kernel on the shared instance — mirroring how a real app drives
// libjpeg-turbo across many frames.
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

const distPath = resolve(distDir, "libjpegturbowasm.js")
const skip = !existsSync(distPath)

const jpegEncoded = !skip
  ? readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))
  : null
const rawDecoded = !skip
  ? readFileSync(resolve(fixturesDir, "raw/jpeg400jfif.raw"))
  : null

let codec
let decoder
let encoder
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decoder = new codec.JPEGDecoder()
  decoder.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
  decoder.decode() // warmup

  encoder = new codec.JPEGEncoder()
  encoder
    .getDecodedBuffer({
      width: 600,
      height: 800,
      bitsPerSample: 8,
      componentCount: 1,
      isSigned: false,
    })
    .set(rawDecoded)
  encoder.encode() // warmup
}

describe.skipIf(skip)("libjpeg-turbo-8bit (wasm)", () => {
  bench("instantiate+destroy JPEGDecoder", () => {
    const d = new codec.JPEGDecoder()
    d.delete()
  })

  bench("instantiate+destroy JPEGEncoder", () => {
    const e = new codec.JPEGEncoder()
    e.delete()
  })

  bench("decode jpeg400jfif.jpg (600x800x8bit) — reused decoder", () => {
    decoder.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
    decoder.decode()
  })

  bench("encode raw 600x800x8bit (lossy default) — reused encoder", () => {
    encoder
      .getDecodedBuffer({
        width: 600,
        height: 800,
        bitsPerSample: 8,
        componentCount: 1,
        isSigned: false,
      })
      .set(rawDecoded)
    encoder.encode()
  })
})
