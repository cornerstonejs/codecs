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

    it("decodes through the dispatcher", async () => {
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
      expect(result.imageInfo.width).toBe(600)
      expect(result.imageInfo.height).toBe(800)
      expect(typeof result.processInfo.duration).toBe("number")
    })
  })

  describe("JPEG-LS Lossless (1.2.840.10008.1.2.4.80)", () => {
    const jlsBytes = readFileSync(
      resolve(packagesRoot, "charls/test/fixtures/CT1.JLS")
    )

    it("decodes through the dispatcher", async () => {
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
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("JPEG 2000 Lossless (1.2.840.10008.1.2.4.90)", () => {
    const j2kBytes = readFileSync(
      resolve(packagesRoot, "openjpeg/test/fixtures/j2k/CT1.j2k")
    )

    it("decodes through the dispatcher", async () => {
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
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("HTJ2K (1.2.840.10008.1.2.4.201)", () => {
    const j2cBytes = readFileSync(
      resolve(packagesRoot, "openjphjs/test/fixtures/j2c/CT1.j2c")
    )

    it("decodes through the dispatcher", async () => {
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
      expect(result.imageInfo.width).toBe(512)
      expect(result.imageInfo.height).toBe(512)
    })
  })

  describe("JPEG Lossless (1.2.840.10008.1.2.4.57 / .70)", () => {
    // These go through dicom-codec's internal jpegLosslessCodec
    // (jpeg-lossless-decoder-js, pure JS — no separate wasm package). Both
    // fixtures decode the same 512x512x16 CT slice.
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

    const ctImageInfo = {
      rows: 512,
      columns: 512,
      bitsAllocated: 16,
      samplesPerPixel: 1,
      pixelRepresentation: 1,
      signed: true,
    }

    it("decodes Process 14 through the dispatcher (.57)", async () => {
      const result = await dicomCodec.decode(
        jpllProcess14,
        ctImageInfo,
        "1.2.840.10008.1.2.4.57"
      )
      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
    })

    it("decodes Process 14 SV1 through the dispatcher (.70)", async () => {
      const result = await dicomCodec.decode(
        jpllProcess14Sv1,
        ctImageInfo,
        "1.2.840.10008.1.2.4.70"
      )
      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
    })
  })

  describe("RLE Lossless (1.2.840.10008.1.2.5)", () => {
    // Routed to dicom-codec's internal rleLossless.js (pure JS).
    const rleBytes = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/rle/CT-512x512.rle")
    )

    it("decodes through the dispatcher", async () => {
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

      expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
    })
  })
})
