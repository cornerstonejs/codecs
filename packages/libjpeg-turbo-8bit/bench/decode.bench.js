// Decoder/encoder construction is hoisted to module scope so the bench
// body only measures the decode/encode kernel itself. A separate
// "instantiate+destroy" bench measures the lifecycle cost that the old
// monolithic bench was conflating with kernel time.

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
let dec
let enc
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  dec = new codec.JPEGDecoder()
  dec.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)

  enc = new codec.JPEGEncoder()
  enc
    .getDecodedBuffer({
      width: 600,
      height: 800,
      bitsPerSample: 8,
      componentCount: 1,
      isSigned: false,
    })
    .set(rawDecoded)
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

  bench("decode jpeg400jfif.jpg (600x800x8bit) — kernel", () => {
    dec.decode()
  })

  bench("encode raw 600x800x8bit (lossy default) — kernel", () => {
    enc.encode()
  })
})
