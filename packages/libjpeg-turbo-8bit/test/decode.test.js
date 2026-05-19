import { beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, "fixtures")

const jpeg400 = readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))
const jpeg400Raw = readFileSync(resolve(fixturesDir, "raw/jpeg400jfif.raw"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbojs)", path: "../dist/libjpegturbojs.js" },
  { name: "wasm (libjpegturbowasm)", path: "../dist/libjpegturbowasm.js" },
]

describe.each(buildVariants)("libjpeg-turbo-8bit decode — $name", ({ path }) => {
  let codec

  beforeAll(async () => {
    codec = await loadModule(path)
  })

  it("decodes the jpeg400 grayscale fixture", () => {
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(jpeg400.length)
    encodedBuffer.set(jpeg400)

    decoder.decode()

    const frameInfo = decoder.getFrameInfo()
    expect(frameInfo.width).toBe(600)
    expect(frameInfo.height).toBe(800)
    expect(frameInfo.bitsPerSample).toBe(8)
    expect(frameInfo.componentCount).toBe(1)

    const decoded = decoder.getDecodedBuffer()
    expect(decoded.length).toBe(600 * 800)
    expect(decoded.length).toBe(jpeg400Raw.length)

    decoder.delete()
  })

  it("throws or marks error on truncated input", () => {
    const truncated = jpeg400.subarray(0, Math.floor(jpeg400.length / 2))
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(truncated.length)
    encodedBuffer.set(truncated)

    expect(() => decoder.decode()).toThrow()

    decoder.delete()
  })
})

describe.each(buildVariants)(
  "libjpeg-turbo-8bit encode + round-trip — $name",
  ({ path }) => {
    let codec

    beforeAll(async () => {
      codec = await loadModule(path)
    })

    it("encodes raw → JPEG and decodes back to the same dimensions", () => {
      const frameInfo = {
        width: 600,
        height: 800,
        bitsPerSample: 8,
        componentCount: 1,
        isSigned: false,
      }
      const encoder = new codec.JPEGEncoder()
      const decodedBytes = encoder.getDecodedBuffer(frameInfo)
      decodedBytes.set(jpeg400Raw)

      encoder.encode()
      const encoded = encoder.getEncodedBuffer()
      expect(encoded.length).toBeGreaterThan(0)
      expect(encoded.length).toBeLessThan(jpeg400Raw.length)

      const decoder = new codec.JPEGDecoder()
      const inBuffer = decoder.getEncodedBuffer(encoded.length)
      inBuffer.set(encoded)
      decoder.decode()

      const roundTripFrameInfo = decoder.getFrameInfo()
      expect(roundTripFrameInfo.width).toBe(frameInfo.width)
      expect(roundTripFrameInfo.height).toBe(frameInfo.height)
      expect(roundTripFrameInfo.bitsPerSample).toBe(frameInfo.bitsPerSample)
      expect(roundTripFrameInfo.componentCount).toBe(frameInfo.componentCount)

      const roundTripDecoded = decoder.getDecodedBuffer()
      expect(roundTripDecoded.length).toBe(jpeg400Raw.length)

      decoder.delete()
      encoder.delete()
    })
  }
)
