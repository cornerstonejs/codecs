// Cold vs warm decode benches for the 12-bit codec, mirroring the 8-bit
// package's bench shape (see libjpeg-turbo-8bit/bench/decode.bench.js for
// the cold/warm methodology notes). Without this file the 12-bit package
// was invisible to CodSpeed — a toolchain bump's full bench sweep measured
// nothing for it.
import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "libjpegturbo12wasm.js")
const skip = !existsSync(distPath)

const encoded = !skip
  ? readFileSync(resolve(fixturesDir, "jpeg/CT-512x512-12bit.jpg"))
  : null

let codec
let warmDecoder

async function loadCodec() {
  const mod = await import(distPath)
  const factory = mod.default ?? mod
  return await factory()
}

function decodeOnce(decoder) {
  decoder.getEncodedBuffer(encoded.length).set(encoded)
  decoder.decode()
  return decoder.getDecodedBuffer()
}

if (!skip) {
  codec = await loadCodec()
  warmDecoder = new codec.JPEGDecoder()
  for (let i = 0; i < 5; i++) decodeOnce(warmDecoder)
}

describe.skipIf(skip)("libjpeg-turbo-12bit (wasm)", () => {
  bench("decode CT-512x512-12bit.jpg (512x512x12bit) — cold", () => {
    const decoder = new codec.JPEGDecoder()
    decodeOnce(decoder)
    decoder.delete()
  })

  bench("decode CT-512x512-12bit.jpg (512x512x12bit) — warm", () => {
    decodeOnce(warmDecoder)
  })
})
