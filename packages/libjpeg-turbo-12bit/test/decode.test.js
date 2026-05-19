import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const jpegEncoded = readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))
const rawDecoded = readFileSync(resolve(fixturesDir, "raw/jpeg400jfif.raw"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbo12js)", path: "../dist/libjpegturbo12js.js", dist: "libjpegturbo12js.js" },
  { name: "wasm (libjpegturbo12wasm)", path: "../dist/libjpegturbo12wasm.js", dist: "libjpegturbo12wasm.js" },
]

describe.each(buildVariants)(
  "libjpeg-turbo-12bit decode — $name",
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)("decodes the 8-bit jpeg400 fixture", () => {
      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(600)
      expect(frameInfo.height).toBe(800)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      expect(decoded.length).toBe(rawDecoded.length)

      decoder.delete()
    })

    it.skipIf(!isBuilt)("throws on truncated input", () => {
      const truncated = jpegEncoded.subarray(
        0,
        Math.floor(jpegEncoded.length / 2)
      )
      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(truncated.length).set(truncated)

      expect(() => decoder.decode()).toThrow()

      decoder.delete()
    })
  }
)
