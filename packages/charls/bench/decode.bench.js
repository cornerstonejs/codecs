import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "charlswasm.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT1.JLS")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT2.JLS")) : null
const ct2Raw = !skip ? readFileSync(resolve(fixturesDir, "CT2.RAW")) : null
const ctNearLossless = !skip
  ? readFileSync(resolve(fixturesDir, "CT-512x512-near-lossless.JLS"))
  : null

let codec
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("charls JPEG-LS (wasm)", () => {
  bench("decode CT1.JLS (.80 lossless, 512x512x16bit)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()
    decoder.delete()
  })

  bench("decode CT2.JLS (.80 lossless, 512x512x16bit)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()
    decoder.delete()
  })

  bench("decode CT-512x512-near-lossless.JLS (.81 near-lossless)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)
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
