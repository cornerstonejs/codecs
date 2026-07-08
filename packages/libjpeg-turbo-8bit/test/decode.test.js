import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const jpeg400 = readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))
const jpeg400Raw = readFileSync(resolve(fixturesDir, "raw/jpeg400jfif.raw"))
// Progressive (SOF2) variant of the same image — a distinct libjpeg decode
// module (jdcoefct/progressive refinement) not exercised by the baseline
// fixture. Golden verified bit-identical against Pillow's independently
// built libjpeg on 2026-07-07; asm.js and wasm variants agree byte-exact.
const jpegProgressive = readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif-new.jpg"))
const jpegProgressiveRaw = readFileSync(resolve(fixturesDir, "raw/jpeg400jfif-new.raw"))
// Color 4:2:0 YCbCr baseline JPEG encoded from the US1 RGB ultrasound frame
// (tools/fixture-verification/gen/generate-fixtures.mjs). Decoded golden
// verified bit-identical against DCMTK dcmdjpeg (0 of 921600 bytes differ,
// 2026-07-07) — pins the YCbCr->RGB conversion + chroma upsampling path.
const jpegColor = readFileSync(resolve(fixturesDir, "jpeg/US1-color-420.jpg"))
const jpegColorRaw = readFileSync(resolve(fixturesDir, "raw/US1-color-420.raw"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbojs)", path: "../dist/libjpegturbojs.js", dist: "libjpegturbojs.js" },
  { name: "wasm (libjpegturbowasm)", path: "../dist/libjpegturbowasm.js", dist: "libjpegturbowasm.js" },
]

describe.each(buildVariants)("libjpeg-turbo-8bit decode — $name", ({ path, dist }) => {
  const isBuilt = existsSync(resolve(distDir, dist))
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(path)
  })

  // In CI a missing dist means the build/artifact pipeline broke; fail loudly
  // instead of letting every skipIf() below silently skip the suite.
  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, `${dist} missing — build artifact was not replayed`).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes the jpeg400 grayscale fixture to bytes matching the RAW reference", () => {
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
    expect(decoded.length).toBe(jpeg400Raw.length)
    // Baseline JPEG decoding is deterministic: the decoded pixels must match
    // the RAW reference exactly (identical across asm.js and wasm variants).
    expect(Buffer.from(decoded).equals(jpeg400Raw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("decodes a progressive (SOF2) JPEG to bytes matching the RAW reference", () => {
    const decoder = new codec.JPEGDecoder()
    decoder.getEncodedBuffer(jpegProgressive.length).set(jpegProgressive)
    decoder.decode()

    const frameInfo = decoder.getFrameInfo()
    expect(frameInfo.width).toBe(600)
    expect(frameInfo.height).toBe(800)
    expect(frameInfo.componentCount).toBe(1)

    const decoded = decoder.getDecodedBuffer()
    expect(Buffer.from(decoded).equals(jpegProgressiveRaw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("decodes a color 4:2:0 YCbCr JPEG to interleaved RGB matching the DCMTK-verified reference", () => {
    const decoder = new codec.JPEGDecoder()
    decoder.getEncodedBuffer(jpegColor.length).set(jpegColor)
    decoder.decode()

    const frameInfo = decoder.getFrameInfo()
    expect(frameInfo.width).toBe(640)
    expect(frameInfo.height).toBe(480)
    expect(frameInfo.componentCount).toBe(3)

    const decoded = decoder.getDecodedBuffer()
    expect(decoded.length).toBe(640 * 480 * 3)
    expect(Buffer.from(decoded).equals(jpegColorRaw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("throws or marks error on truncated input", () => {
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
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)("encodes raw → JPEG and decodes back to the same dimensions", () => {
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

      // Baseline JPEG is lossy, so byte equality is not expected — but the
      // error must stay small. Measured on this fixture: maxAbsDiff 6,
      // meanAbsDiff 0.26. Bound it so a broken DCT/quantization path (which
      // produces structurally wrong pixels, not slightly-off ones) fails.
      let maxAbsDiff = 0
      let totalAbsDiff = 0
      for (let i = 0; i < jpeg400Raw.length; i++) {
        const diff = Math.abs(roundTripDecoded[i] - jpeg400Raw[i])
        if (diff > maxAbsDiff) maxAbsDiff = diff
        totalAbsDiff += diff
      }
      expect(maxAbsDiff).toBeLessThanOrEqual(10)
      expect(totalAbsDiff / jpeg400Raw.length).toBeLessThanOrEqual(1)

      decoder.delete()
      encoder.delete()
    })
  }
)
