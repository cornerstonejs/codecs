import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const ct1Encoded = readFileSync(resolve(fixturesDir, "CT1.JLS"))
// CT1.RAW is the lossless reference for CT1.JLS. The same slice ships as
// openjpeg's CT1.RAW and openjphjs's CT1.RAW; charls, openjpeg and openjph
// all decode their CT1 fixtures to these exact bytes, so the three codecs
// cross-validate each other.
const ct1Raw = readFileSync(resolve(fixturesDir, "CT1.RAW"))
const ct2Encoded = readFileSync(resolve(fixturesDir, "CT2.JLS"))
const ct2Raw = readFileSync(resolve(fixturesDir, "CT2.RAW"))
// CT-512x512-near-lossless.JLS is a real .81 (JPEG-LS Lossy / Near-Lossless)
// payload extracted from a Cornerstone3D test DICOM. Decoding exercises the
// same charls codec but verifies the near-lossless code path (NEAR > 0).
// Near-lossless decoding is deterministic, so the decoder's own output is
// pinned as a regression golden (identical across all three build variants).
const ctNearLossless = readFileSync(
  resolve(fixturesDir, "CT-512x512-near-lossless.JLS")
)
const ctNearLosslessRaw = readFileSync(
  resolve(fixturesDir, "CT-512x512-near-lossless.RAW")
)

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js full (charlsjs)", path: "../dist/charlsjs.js", dist: "charlsjs.js" },
  { name: "wasm full (charlswasm)", path: "../dist/charlswasm.js", dist: "charlswasm.js" },
  { name: "wasm decode-only", path: "../dist/charlswasm_decode.js", dist: "charlswasm_decode.js" },
]

describe.each(buildVariants)("charls JPEG-LS decode — $name", ({ path, dist }) => {
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

  it.skipIf(!isBuilt)("exposes a version string", () => {
    expect(typeof codec.getVersion()).toBe("string")
  })

  it.skipIf(!isBuilt)("decodes CT1.JLS to bytes matching CT1.RAW (lossless)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    decoder.decode()

    const frameInfo = decoder.getFrameInfo()
    expect(frameInfo.width).toBe(512)
    expect(frameInfo.height).toBe(512)
    expect(frameInfo.bitsPerSample).toBe(16)
    expect(frameInfo.componentCount).toBe(1)

    const decoded = decoder.getDecodedBuffer()
    expect(decoded.length).toBe(ct1Raw.length)
    expect(Buffer.from(decoded).equals(ct1Raw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("decodes CT2.JLS to bytes matching CT2.RAW (lossless)", () => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()

    const decoded = decoder.getDecodedBuffer()
    expect(decoded.length).toBe(ct2Raw.length)
    expect(Buffer.from(decoded).equals(ct2Raw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)(
    "decodes a near-lossless CT JLS (transfer syntax .81) matching the pinned golden output",
    () => {
      const decoder = new codec.JpegLSDecoder()
      decoder.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(512)
      expect(frameInfo.height).toBe(512)
      expect(frameInfo.bitsPerSample).toBe(16)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      expect(decoded.length).toBe(ctNearLosslessRaw.length)
      expect(Buffer.from(decoded).equals(ctNearLosslessRaw)).toBe(true)
      decoder.delete()
    }
  )
})

const encoderVariants = buildVariants.filter((v) => !v.name.includes("decode-only"))

describe.each(encoderVariants)(
  "charls JPEG-LS encode + round-trip — $name",
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)("encodes CT2.RAW losslessly (near=0) and decodes back to original", () => {
      const frameInfo = {
        width: 512,
        height: 512,
        bitsPerSample: 16,
        componentCount: 1,
      }
      const encoder = new codec.JpegLSEncoder()
      encoder.getDecodedBuffer(frameInfo).set(ct2Raw)
      encoder.setNearLossless(0)
      encoder.encode()
      const encoded = encoder.getEncodedBuffer()
      expect(encoded.length).toBeGreaterThan(0)
      expect(encoded.length).toBeLessThan(ct2Raw.length)

      const decoder = new codec.JpegLSDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()
      const decoded = decoder.getDecodedBuffer()

      expect(decoded.length).toBe(ct2Raw.length)
      expect(Buffer.from(decoded).equals(ct2Raw)).toBe(true)

      encoder.delete()
      decoder.delete()
    })
  }
)
