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
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("libjpeg-turbo-8bit (wasm)", () => {
  bench("decode jpeg400jfif.jpg (600x800x8bit)", () => {
    const decoder = new codec.JPEGDecoder()
    decoder.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
    decoder.decode()
    decoder.delete()
  })

  bench("encode raw 600x800x8bit (lossy default)", () => {
    const encoder = new codec.JPEGEncoder()
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
    encoder.delete()
  })
})
