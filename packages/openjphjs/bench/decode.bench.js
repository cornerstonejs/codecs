import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "openjphjs.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip
  ? readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
  : null
const ct1Raw = !skip
  ? readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))
  : null

let codec
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("openjphjs HTJ2K (wasm)", () => {
  bench("decode CT1.j2c (512x512x16bit)", () => {
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()
    decoder.delete()
  })

  bench("encode CT1.RAW (HTJ2K lossless)", () => {
    const encoder = new codec.HTJ2KEncoder()
    encoder
      .getDecodedBuffer({
        width: 512,
        height: 512,
        bitsPerSample: 16,
        componentCount: 1,
        isSigned: true,
        isUsingColorTransform: false,
      })
      .set(ct1Raw)
    encoder.encode()
    encoder.delete()
  })
})
