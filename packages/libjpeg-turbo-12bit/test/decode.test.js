import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, "fixtures")

// Genuine 12-bit baseline JPEG fixture (SOF marker 0xC1, precision=12,
// 512x512, 1 component — verified by inspecting the JPEG SOF segment).
const ct12bit = readFileSync(resolve(fixturesDir, "jpeg/CT-512x512-12bit.jpg"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbo12js)", path: "../dist/libjpegturbo12js.js" },
  { name: "wasm (libjpegturbo12wasm)", path: "../dist/libjpegturbo12wasm.js" },
]

describe.each(buildVariants)("libjpeg-turbo-12bit decode — $name", ({ path }) => {
  const isBuilt = existsSync(resolve(__dirname, path))
  let codec

  beforeAll(async () => {
    if (isBuilt) {
      codec = await loadModule(path)
    }
  })

  it.skipIf(!isBuilt)(
    "decodes the CT-512x512 12-bit fixture and reports correct dimensions/format",
    () => {
      const decoder = new codec.JPEGDecoder()
      const encodedBuffer = decoder.getEncodedBuffer(ct12bit.length)
      encodedBuffer.set(ct12bit)

      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(512)
      expect(frameInfo.height).toBe(512)
      expect(frameInfo.bitsPerSample).toBe(12)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      // One 16-bit-wide sample per pixel (grayscale, 1 component/pixel).
      expect(decoded.length).toBe(512 * 512)

      decoder.delete()
    }
  )

  // TODO: needs a real 12-bit fixture RAW reference (a decoded pixel buffer
  // generated and verified by a trusted independent decoder) to perform a
  // pixel-accurate comparison. fixtures/jpeg/CT-512x512-12bit.jpg is a
  // genuine 12-bit baseline JPEG (verified via its SOF segment: marker
  // 0xC1, precision=12, 512x512, 1 component), but no corresponding decoded
  // RAW reference exists in the repo yet, so we do not fabricate expected
  // pixel data here. Once fixtures/raw/CT-512x512-12bit.raw is added,
  // replace this skip with a Buffer.equals-style comparison like the 8-bit
  // decode test.
  it.skip("decodes the CT-512x512 12-bit fixture and matches the RAW reference", () => {})

  it.skipIf(!isBuilt)("throws or marks error on truncated input", () => {
    const truncated = ct12bit.subarray(0, Math.floor(ct12bit.length / 2))
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(truncated.length)
    encodedBuffer.set(truncated)

    expect(() => decoder.decode()).toThrow()

    decoder.delete()
  })
})
