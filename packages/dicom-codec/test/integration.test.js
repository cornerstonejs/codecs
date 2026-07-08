import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const LIBJPEG_8BIT_BUILT = existsSync(
  resolve(packagesRoot, "libjpeg-turbo-8bit/dist/libjpegturbojs.js")
)
const CHARLS_BUILT = existsSync(
  resolve(packagesRoot, "charls/dist/charlsjs.js")
)
const OPENJPEG_BUILT = existsSync(
  resolve(packagesRoot, "openjpeg/dist/openjpegjs.js")
)
const OPENJPH_BUILT = existsSync(
  resolve(packagesRoot, "openjphjs/dist/openjphjs.js")
)

const ALL_BUILT =
  LIBJPEG_8BIT_BUILT && CHARLS_BUILT && OPENJPEG_BUILT && OPENJPH_BUILT

// Byte view over a decoded imageFrame regardless of its typed-array flavor
// (Uint8Array, Uint16Array, Int16Array, ...).
function frameBytes(imageFrame) {
  return Buffer.from(
    imageFrame.buffer,
    imageFrame.byteOffset ?? 0,
    imageFrame.byteLength
  )
}

// In CI a missing sibling dist means the build/artifact pipeline broke; fail
// loudly instead of letting describe.skipIf() silently skip the whole suite.
it.runIf(process.env.CI)("sibling codec dists are present in CI", () => {
  expect(ALL_BUILT, "one or more codec dists missing — artifacts not replayed").toBe(true)
})

describe.skipIf(!ALL_BUILT)("dicom-codec integration", () => {
  let dicomCodec

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  describe("JPEG Baseline (1.2.840.10008.1.2.4.50)", () => {
    const jpegBytes = readFileSync(
      resolve(
        packagesRoot,
        "libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg"
      )
    )
    const jpegRaw = readFileSync(
      resolve(packagesRoot, "libjpeg-turbo-8bit/test/fixtures/raw/jpeg400jfif.raw")
    )

    it("decodes through the dispatcher to the exact reference pixels", async () => {
      const imageInfo = {
        rows: 800,
        columns: 600,
        bitsAllocated: 8,
        samplesPerPixel: 1,
        pixelRepresentation: 0,
        signed: false,
      }

      const result = await dicomCodec.decode(
        jpegBytes,
        imageInfo,
        "1.2.840.10008.1.2.4.50"
      )

      expect(result.imageFrame.byteLength).toBe(600 * 800)
      expect(frameBytes(result.imageFrame).equals(jpegRaw)).toBe(true)
      expect(result.imageInfo.width).toBe(600)
      expect(result.imageInfo.height).toBe(800)
      expect(typeof result.processInfo.duration).toBe("number")
    })
  })

  describe("JPEG-LS Lossless (1.2.840.10008.1.2.4.80)", () => {
    const jlsBytes = readFileSync(
      resolve(packagesRoot, "charls/test/fixtures/CT1.JLS")
    )
    const jlsRaw = readFileSync(
      resolve(packagesRoot, "charls/test/fixtures/CT1.RAW")
    )

    it("decodes through the dispatcher to the exact reference pixels", async () => {
      const imageInfo = {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      }

      const result = await dicomCodec.decode(
        jlsBytes,
        imageInfo,
        "1.2.840.10008.1.2.4.80"
      )

      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
      expect(frameBytes(result.imageFrame).equals(jlsRaw)).toBe(true)
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("JPEG 2000 Lossless (1.2.840.10008.1.2.4.90)", () => {
    const j2kBytes = readFileSync(
      resolve(packagesRoot, "openjpeg/test/fixtures/j2k/CT1.j2k")
    )
    const j2kRaw = readFileSync(
      resolve(packagesRoot, "openjpeg/test/fixtures/raw/CT1.RAW")
    )

    it("decodes through the dispatcher to the exact reference pixels", async () => {
      const imageInfo = {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      }

      const result = await dicomCodec.decode(
        j2kBytes,
        imageInfo,
        "1.2.840.10008.1.2.4.90"
      )

      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
      expect(frameBytes(result.imageFrame).equals(j2kRaw)).toBe(true)
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("HTJ2K (1.2.840.10008.1.2.4.201)", () => {
    const j2cBytes = readFileSync(
      resolve(packagesRoot, "openjphjs/test/fixtures/j2c/CT1.j2c")
    )
    const j2cRaw = readFileSync(
      resolve(packagesRoot, "openjphjs/test/fixtures/raw/CT1.RAW")
    )

    it("decodes through the dispatcher to the exact reference pixels", async () => {
      const imageInfo = {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      }

      const result = await dicomCodec.decode(
        j2cBytes,
        imageInfo,
        "1.2.840.10008.1.2.4.201"
      )

      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
      expect(frameBytes(result.imageFrame).equals(j2cRaw)).toBe(true)
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("JPEG Lossless (1.2.840.10008.1.2.4.57 / .70)", () => {
    // These go through dicom-codec's internal jpegLosslessCodec
    // (jpeg-lossless-decoder-js, pure JS — no separate wasm package). Both
    // fixtures encode the same 512x512x16 CT slice; the reference
    // fixtures/raw/CT-512x512.raw was cross-validated three ways: the RLE
    // decoder, the Process 14 path of jpeg-lossless-decoder-js and DCMTK's
    // dcmdjpeg all produce these exact bytes.
    const jpllProcess14 = readFileSync(
      resolve(
        packagesRoot,
        "dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14.jpll"
      )
    )
    const jpllProcess14Sv1 = readFileSync(
      resolve(
        packagesRoot,
        "dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14-sv1.jpll"
      )
    )
    const ctRaw = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/raw/CT-512x512.raw")
    )

    const ctImageInfo = {
      rows: 512,
      columns: 512,
      bitsAllocated: 16,
      samplesPerPixel: 1,
      pixelRepresentation: 1,
      signed: true,
    }

    it("decodes Process 14 through the dispatcher (.57) to the exact reference pixels", async () => {
      const result = await dicomCodec.decode(
        jpllProcess14,
        ctImageInfo,
        "1.2.840.10008.1.2.4.57"
      )
      expect(result.imageFrame.byteLength).toBe(ctRaw.length)
      expect(frameBytes(result.imageFrame).equals(ctRaw)).toBe(true)
    })

    // KNOWN UPSTREAM BUG (jpeg-lossless-decoder-js): the SV1 path decodes
    // the final pixel of this fixture as 0 instead of -2000. DCMTK's
    // dcmdjpeg confirms the fixture itself is correct (its decode matches
    // CT-512x512.raw exactly, last pixel included), so the defect is in the
    // JS decoder. The test below pins today's behavior: every sample except
    // the last matches the reference. When the upstream bug is fixed, the
    // paired `it.fails` test starts passing and vitest will flag it — then
    // fold these two tests into a single exact comparison.
    it("decodes Process 14 SV1 through the dispatcher (.70) — all but the last pixel match", async () => {
      const result = await dicomCodec.decode(
        jpllProcess14Sv1,
        ctImageInfo,
        "1.2.840.10008.1.2.4.70"
      )
      expect(result.imageFrame.byteLength).toBe(ctRaw.length)

      const actual = frameBytes(result.imageFrame)
      // Everything up to the final 16-bit sample must match exactly.
      expect(actual.subarray(0, ctRaw.length - 2).equals(ctRaw.subarray(0, ctRaw.length - 2))).toBe(true)
    })

    it.fails("decodes Process 14 SV1 (.70) to the exact reference pixels (known upstream last-pixel bug)", async () => {
      const result = await dicomCodec.decode(
        jpllProcess14Sv1,
        ctImageInfo,
        "1.2.840.10008.1.2.4.70"
      )
      expect(frameBytes(result.imageFrame).equals(ctRaw)).toBe(true)
    })
  })

  describe("RLE Lossless (1.2.840.10008.1.2.5)", () => {
    // Routed to dicom-codec's internal rleLossless.js (pure JS). The RAW
    // reference is cross-validated: the JPEG Lossless Process 14 decode of
    // the same slice and DCMTK both produce these exact bytes.
    const rleBytes = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/rle/CT-512x512.rle")
    )
    const ctRaw = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/raw/CT-512x512.raw")
    )

    it("decodes through the dispatcher to the exact reference pixels", async () => {
      const imageInfo = {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      }

      const result = await dicomCodec.decode(
        rleBytes,
        imageInfo,
        "1.2.840.10008.1.2.5"
      )

      expect(result.imageFrame.byteLength).toBe(ctRaw.length)
      expect(frameBytes(result.imageFrame).equals(ctRaw)).toBe(true)
    })
  })
})
