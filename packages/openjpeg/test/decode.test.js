import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const ct1Encoded = readFileSync(resolve(fixturesDir, "j2k/CT1.j2k"))
const ct1Raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))
const ct2Encoded = readFileSync(resolve(fixturesDir, "j2k/CT2.j2k"))
const ct2Raw = readFileSync(resolve(fixturesDir, "raw/CT2.RAW"))
// CT-512x512-lossy.j2k is a real .91 (JPEG 2000 Lossy) payload extracted from
// a Cornerstone3D test DICOM. Uses an irreversible 9-7 wavelet, so byte
// equality with any RAW is not expected.
const ctLossy = readFileSync(resolve(fixturesDir, "j2k/CT-512x512-lossy.j2k"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js full (openjpegjs)", path: "../dist/openjpegjs.js", dist: "openjpegjs.js" },
  { name: "wasm full (openjpegwasm)", path: "../dist/openjpegwasm.js", dist: "openjpegwasm.js" },
  { name: "wasm decode-only", path: "../dist/openjpegwasm_decode.js", dist: "openjpegwasm_decode.js" },
]

describe.each(buildVariants)("openjpeg J2K decode — $name", ({ path, dist }) => {
  const isBuilt = existsSync(resolve(distDir, dist))
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(path)
  })

  it.skipIf(!isBuilt)(
    "decodes CT1.j2k to a 512x512 16-bit monochrome frame",
    () => {
      const decoder = new codec.J2KDecoder()
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
    }
  )

  it.skipIf(!isBuilt)("decodes CT2.j2k losslessly to CT2.RAW", () => {
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()

    const decoded = decoder.getDecodedBuffer()
    expect(Buffer.from(decoded).equals(ct2Raw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)(
    "decodes a lossy 9-7 J2K (transfer syntax .91) to a 512x512 16-bit frame",
    () => {
      const decoder = new codec.J2KDecoder()
      decoder.getEncodedBuffer(ctLossy.length).set(ctLossy)
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(512)
      expect(frameInfo.height).toBe(512)
      expect(frameInfo.bitsPerSample).toBe(16)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      expect(decoded.length).toBe(512 * 512 * 2)
      decoder.delete()
    }
  )
})

const encoderVariants = buildVariants.filter((v) => !v.name.includes("decode-only"))

describe.each(encoderVariants)(
  "openjpeg J2K encode + round-trip — $name",
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)(
      "encodes CT1.RAW losslessly and decodes back to original bytes",
      () => {
        const frameInfo = {
          width: 512,
          height: 512,
          bitsPerSample: 16,
          componentCount: 1,
          isSigned: true,
        }
        const encoder = new codec.J2KEncoder()
        encoder.getDecodedBuffer(frameInfo).set(ct1Raw)
        encoder.encode()
        const encoded = encoder.getEncodedBuffer()
        expect(encoded.length).toBeGreaterThan(0)

        const decoder = new codec.J2KDecoder()
        decoder.getEncodedBuffer(encoded.length).set(encoded)
        decoder.decode()
        const decoded = decoder.getDecodedBuffer()

        expect(decoded.length).toBe(ct1Raw.length)
        expect(Buffer.from(decoded).equals(ct1Raw)).toBe(true)

        encoder.delete()
        decoder.delete()
      }
    )
  }
)
