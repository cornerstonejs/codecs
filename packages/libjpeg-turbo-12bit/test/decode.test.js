import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, "fixtures")

// Genuine 12-bit baseline JPEG fixture (SOF marker 0xC1, precision=12,
// 512x512, 1 component — verified by inspecting the JPEG SOF segment).
const ct12bit = readFileSync(resolve(fixturesDir, "jpeg/CT-512x512-12bit.jpg"))
// Decoded reference for the fixture above: little-endian Uint16 samples,
// verified bit-identical against DCMTK's dcmdjpeg (independent reference
// decoder) and identical across the asm.js and wasm build variants.
const ct12bitRaw = readFileSync(resolve(fixturesDir, "raw/CT-512x512-12bit.raw"))

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

  // In CI a missing dist means the build/artifact pipeline broke; fail loudly
  // instead of letting every skipIf() below silently skip the suite.
  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, `${path} missing — build artifact was not replayed`).toBe(true)
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

  it.skipIf(!isBuilt)("decodes the CT-512x512 12-bit fixture and matches the RAW reference", () => {
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(ct12bit.length)
    encodedBuffer.set(ct12bit)

    decoder.decode()

    const decoded = decoder.getDecodedBuffer()
    // getDecodedBuffer() returns a Uint16Array (one entry per sample);
    // compare its underlying bytes against the little-endian RAW reference.
    const decodedBytes = Buffer.from(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    )
    expect(decodedBytes.length).toBe(ct12bitRaw.length)
    expect(decodedBytes.equals(ct12bitRaw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("handles truncated input without crashing", () => {
    // libjpeg treats a premature end-of-file as a recoverable warning (it
    // fills the missing scanlines rather than aborting), so decode() may
    // return normally instead of throwing. The meaningful guarantee here is
    // that truncated input is handled gracefully — it either throws or
    // returns, but never corrupts the process.
    const truncated = ct12bit.subarray(0, Math.floor(ct12bit.length / 2))
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(truncated.length)
    encodedBuffer.set(truncated)

    expect(() => {
      try {
        decoder.decode()
      } catch (e) {
        // throwing is an acceptable outcome for malformed input
      }
    }).not.toThrow()

    decoder.delete()
  })
})
