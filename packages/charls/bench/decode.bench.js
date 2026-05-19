import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "charlswasm.js")
const skip = !existsSync(distPath)

const ct2Encoded = !skip
  ? readFileSync(resolve(fixturesDir, "CT2.JLS"))
  : null
const ct2Raw = !skip ? readFileSync(resolve(fixturesDir, "CT2.RAW")) : null

let codec
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("charls JPEG-LS (wasm)", () => {
  bench("decode CT2.JLS (512x512x16bit)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()
    decoder.delete()
  })

  bench("encode CT2.RAW (lossless near=0)", () => {
    const encoder = new codec.JpegLSEncoder()
    encoder
      .getDecodedBuffer({
        width: 512,
        height: 512,
        bitsPerSample: 16,
        componentCount: 1,
      })
      .set(ct2Raw)
    encoder.setNearLossless(0)
    encoder.encode()
    encoder.delete()
  })
})
