import { beforeAll, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "openjpegwasm.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

const ct1 = () => readFileSync(resolve(fixturesDir, "j2k/CT1.j2k"))
const ct1Raw = () => readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))
const lossy = () => readFileSync(resolve(fixturesDir, "j2k/CT-512x512-lossy.j2k"))

// Exercises the embind surface beyond decode(): header introspection,
// sub-resolution (progressive) decode, and encoder setters. Literals are
// derived from CT1's known encode parameters, not blind snapshots: CT1 was
// encoded with 5 decompositions, single layer, LRCP progression, 64x64
// code blocks, grayscale.
describe("openjpeg J2K API surface", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjpegwasm.js")
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, "openjpegwasm.js missing — build artifact was not replayed").toBe(true)
  })

  it.skipIf(!isBuilt)("exposes coding parameters through the getters after decode()", () => {
    const encoded = ct1()
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()

    expect(decoder.getNumDecompositions()).toBe(5)
    expect(decoder.getIsReversible()).toBe(true)
    expect(decoder.getProgressionOrder()).toBe(0) // LRCP
    expect(decoder.getNumLayers()).toBe(1)
    expect(decoder.getColorSpace()).toBe(2) // OPJ_CLRSPC_GRAY
    expect(decoder.getBlockDimensions()).toEqual({ width: 64, height: 64 })
    expect(decoder.getImageOffset()).toEqual({ x: 0, y: 0 })
    expect(decoder.calculateSizeAtDecompositionLevel(0)).toEqual({ width: 512, height: 512 })
    expect(decoder.calculateSizeAtDecompositionLevel(1)).toEqual({ width: 256, height: 256 })
    expect(decoder.calculateSizeAtDecompositionLevel(2)).toEqual({ width: 128, height: 128 })

    decoder.delete()
  })

  // KNOWN BUG (found 2026-07-07 while adding this suite): readHeader() does
  // not populate frameInfo or the coding-parameter state — every getter
  // returns zeros (and, for some fixtures, uninitialized values such as
  // getNumDecompositions() === 4294965296). Consumers must call decode()
  // before trusting any getter. When readHeader() is fixed to parse the
  // header, this test starts passing and vitest will flag it — then convert
  // it into a plain it().
  it.fails.skipIf(!isBuilt)("readHeader() alone populates frameInfo (known broken)", () => {
    const encoded = ct1()
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.readHeader()
    const frameInfo = decoder.getFrameInfo()
    decoder.delete()
    expect(frameInfo.width).toBe(512)
  })

  // KNOWN BUG: the .91 fixture uses the irreversible 9-7 wavelet, but
  // getIsReversible() reports true after decoding it. Flips to failing
  // (= fixed) when the wiring is corrected.
  it.fails.skipIf(!isBuilt)("getIsReversible() is false for the lossy 9-7 stream (known broken)", () => {
    const encoded = lossy()
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const reversible = decoder.getIsReversible()
    decoder.delete()
    expect(reversible).toBe(false)
  })

  it.skipIf(!isBuilt)("decodeSubResolution() produces the level-1 and level-2 images", () => {
    const encoded = ct1()
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)

    decoder.decodeSubResolution(1, 0)
    const sub1 = Buffer.from(decoder.getDecodedBuffer())
    expect(sub1.length).toBe(256 * 256 * 2)
    // Regression pin. Cross-validated: openjphjs decodeSubResolution(1) on
    // CT1.j2c produces the byte-identical buffer (the 5/3 LL band is
    // mathematically shared between J2K and HTJ2K of the same source).
    expect(createHash("sha256").update(sub1).digest("hex")).toBe(
      "b6c934cad65758b2c90b5b7e2bea6ca2cd96574b547bb6720f1ca405e791abee"
    )

    decoder.decodeSubResolution(2, 0)
    const sub2 = Buffer.from(decoder.getDecodedBuffer())
    expect(sub2.length).toBe(128 * 128 * 2)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("setProgressionOrder() round-trips through the encoded stream", () => {
    const raw = ct1Raw()
    const frameInfo = { width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true }
    const encoder = new codec.J2KEncoder()
    encoder.getDecodedBuffer(frameInfo).set(raw)
    encoder.setProgressionOrder(2) // RPCL
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    expect(decoder.getProgressionOrder()).toBe(2)
    // structural change only: pixels still lossless
    expect(Buffer.from(decoder.getDecodedBuffer()).equals(raw)).toBe(true)
    decoder.delete()
  })

  // KNOWN DEAD SETTERS (found 2026-07-07): the encoder stores but never
  // applies blockDimensions_, tileSize_, tileOffset_, precincts_ and
  // downSample_ — encode() never copies them into opj_cparameters
  // (no cblockw_init / cp_tdx / prcw_init wiring). Only imageOffset,
  // progressionOrder, decompositions, quality/ratios are live. This
  // sentinel flips when setBlockDimensions gets wired; wire and test the
  // other four with it.
  it.fails.skipIf(!isBuilt)("setBlockDimensions() round-trips through the encoded stream (known dead setter)", () => {
    const raw = ct1Raw()
    const frameInfo = { width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true }
    const encoder = new codec.J2KEncoder()
    encoder.getDecodedBuffer(frameInfo).set(raw)
    encoder.setBlockDimensions({ width: 32, height: 32 })
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    expect(decoder.getBlockDimensions()).toEqual({ width: 32, height: 32 })
    expect(Buffer.from(decoder.getDecodedBuffer()).equals(raw)).toBe(true)
    decoder.delete()
  })

  it.skipIf(!isBuilt)("setCompressionRatio() produces a lossy stream with bounded distortion", () => {
    const raw = ct1Raw()
    const frameInfo = { width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true }

    const losslessEncoder = new codec.J2KEncoder()
    losslessEncoder.getDecodedBuffer(frameInfo).set(raw)
    losslessEncoder.encode()
    const losslessSize = losslessEncoder.getEncodedBuffer().length
    losslessEncoder.delete()

    const encoder = new codec.J2KEncoder()
    encoder.getDecodedBuffer(frameInfo).set(raw)
    encoder.setQuality(false, 1) // lossy (irreversible 9-7), 1 layer
    encoder.setCompressionRatio(0, 10) // layer 0 at 10:1
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    expect(encoded.length).toBeGreaterThan(0)
    expect(encoded.length).toBeLessThan(losslessSize)

    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const out = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()

    // lossy: not byte-equal, but tightly bounded distortion (PSNR floor)
    expect(out.equals(raw)).toBe(false)
    const a = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
    const b = new Int16Array(out.buffer, out.byteOffset, out.length / 2)
    let sumSq = 0
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i]
      sumSq += d * d
    }
    const mse = sumSq / a.length
    const psnr = 10 * Math.log10((65535 * 65535) / mse)
    // measured ~... generous floor: a broken quantization path lands far below
    expect(psnr).toBeGreaterThan(50)
  })
})
