import { beforeAll, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { gray8FromCT2, gray16uFromCT2 } from "../../../tools/fixture-verification/gen/derive.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "charlsjs.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

const asBuffer = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)

// Color and bit-depth coverage beyond the 16-bit signed CT profile that
// decode.test.js pins.
//
// Fixture provenance (tools/fixture-verification/gen/generate-fixtures.mjs):
// - US1-color-ilv-sample.jls: US1.RAW (640x480 interleaved RGB ultrasound
//   frame shipped in the openjpeg package) encoded losslessly with
//   interleave mode 2 (sample). Lossless => the reference is the source
//   itself. Independently verified byte-identical by pylibjpeg-libjpeg
//   (Thomas Richter's libjpeg — a JPEG-LS implementation independent of
//   CharLS) on 2026-07-07.
// - CT2-gray8.jls / CT2-gray16u.jls: deterministic transforms of CT2.RAW
//   (see derive.mjs), encoded losslessly; tests re-derive the reference.
// - SC1.JLS: shipped 12-bit fixture; decoded output verified byte-exact by
//   pylibjpeg-libjpeg and cross-codec against openjphjs/openjpeg SC1
//   encodings, pinned by SHA-256.
describe("charls JPEG-LS decode matrix — color and bit depths", () => {
  let codec
  const us1 = readFileSync(resolve(__dirname, "../../openjpeg/test/fixtures/raw/US1.RAW"))
  const ct2 = readFileSync(resolve(fixturesDir, "CT2.RAW"))

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/charlsjs.js")
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, "charlsjs.js missing — build artifact was not replayed").toBe(true)
  })

  const decode = (file) => {
    const encoded = readFileSync(resolve(fixturesDir, file))
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const frameInfo = decoder.getFrameInfo()
    const out = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()
    return { frameInfo, out }
  }

  it.skipIf(!isBuilt)("decodes 3-component interleaved color losslessly (ILV=sample)", () => {
    const { frameInfo, out } = decode("US1-color-ilv-sample.jls")
    expect(frameInfo.componentCount).toBe(3)
    expect(frameInfo.width).toBe(640)
    expect(frameInfo.height).toBe(480)
    expect(frameInfo.bitsPerSample).toBe(8)
    expect(out.equals(us1)).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes 8-bit grayscale losslessly", () => {
    const { frameInfo, out } = decode("CT2-gray8.jls")
    expect(frameInfo.bitsPerSample).toBe(8)
    expect(out.equals(asBuffer(gray8FromCT2(ct2)))).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes 16-bit unsigned losslessly", () => {
    const { frameInfo, out } = decode("CT2-gray16u.jls")
    expect(frameInfo.bitsPerSample).toBe(16)
    expect(out.equals(asBuffer(gray16uFromCT2(ct2)))).toBe(true)
  })

  it.skipIf(!isBuilt)("near-lossless encode honors the spec error bound (maxAbsDiff <= NEAR)", () => {
    // T.87 guarantees every reconstructed sample is within NEAR of the
    // source — an exact spec bound, not a heuristic tolerance.
    for (const near of [1, 2, 3]) {
      const encoder = new codec.JpegLSEncoder()
      encoder.getDecodedBuffer({ width: 512, height: 512, bitsPerSample: 16, componentCount: 1 }).set(ct2)
      encoder.setNearLossless(near)
      encoder.encode()
      const encoded = Buffer.from(encoder.getEncodedBuffer())
      encoder.delete()

      const decoder = new codec.JpegLSDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()
      const out = Buffer.from(decoder.getDecodedBuffer())
      decoder.delete()

      const src16 = new Int16Array(ct2.buffer, ct2.byteOffset, ct2.length / 2)
      const out16 = new Int16Array(out.buffer, out.byteOffset, out.length / 2)
      let maxAbsDiff = 0
      for (let i = 0; i < src16.length; i++) {
        const diff = Math.abs(out16[i] - src16[i])
        if (diff > maxAbsDiff) maxAbsDiff = diff
      }
      expect(maxAbsDiff).toBeLessThanOrEqual(near)
      expect(maxAbsDiff).toBeGreaterThan(0) // actually lossy, not accidentally lossless
    }
  })

  it.skipIf(!isBuilt)("decodes the shipped 12-bit SC1 fixture to the pinned pixels", () => {
    const { frameInfo, out } = decode("SC1.JLS")
    expect(frameInfo.width).toBe(2048)
    expect(frameInfo.height).toBe(2487)
    expect(frameInfo.bitsPerSample).toBe(12)
    expect(frameInfo.componentCount).toBe(1)
    // Golden pinned by hash (a 10 MB RAW is not worth committing). Verified
    // three ways (2026-07-07): pylibjpeg-libjpeg (independent JPEG-LS
    // implementation) agrees on all 5,093,376 samples, and the same image's
    // HTJ2K (SC1.j2c) and J2K (SC1.j2k) encodings decode to these exact
    // bytes in openjphjs and openjpeg — three codecs, one pixel truth.
    expect(createHash("sha256").update(out).digest("hex")).toBe(
      "1c8e43cef2a3b25b5304c3dd1732e64c2f44d05d342387ea8e15ce01ec793c32"
    )
  })
})
