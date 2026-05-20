import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(__dirname, "../dist/libjpegturbo12wasm.js")
const fixturePath = resolve(
  __dirname,
  "../test/fixtures/jpeg/CT-512x512-12bit.jpg"
)
const skip = !existsSync(distPath) || !existsSync(fixturePath)

const encoded = !skip ? readFileSync(fixturePath) : null

let codec
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("libjpeg-turbo-12bit (wasm)", () => {
  bench("decode CT-512x512-12bit.jpg", () => {
    const d = new codec.JPEGDecoder()
    d.getEncodedBuffer(encoded.length).set(encoded)
    d.decode()
    d.delete()
  })
})
