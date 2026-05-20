import { beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const REQUIRED_BUILDS = [
  "charls/dist/charlsjs.js",
  "libjpeg-turbo-8bit/dist/libjpegturbojs.js",
  "openjpeg/dist/openjpegjs.js",
  "openjphjs/dist/openjphjs.js",
  "little-endian/dist/index.js",
  "big-endian/dist/index.js",
]

const ALL_BUILT = REQUIRED_BUILDS.every((p) =>
  existsSync(resolve(packagesRoot, p))
)

const SUPPORTED_UIDS = [
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
  "1.2.840.10008.1.2.4.50",
  "1.2.840.10008.1.2.4.57",
  "1.2.840.10008.1.2.4.70",
  "1.2.840.10008.1.2.4.80",
  "1.2.840.10008.1.2.4.81",
  "1.2.840.10008.1.2.4.90",
  "1.2.840.10008.1.2.4.91",
  "1.2.840.10008.1.2.4.201",
  "1.2.840.10008.1.2.4.202",
  "1.2.840.10008.1.2.4.203",
  "3.2.840.10008.1.2.4.96",
  "1.2.840.10008.1.2.5",
]

describe.skipIf(!ALL_BUILT)("dicom-codec dispatcher", () => {
  let dicomCodec

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  describe("hasCodec", () => {
    it.each(SUPPORTED_UIDS)("returns true for supported UID %s", (uid) => {
      expect(dicomCodec.hasCodec(uid)).toBe(true)
    })

    it("returns false for an unknown UID", () => {
      expect(dicomCodec.hasCodec("9.9.9.9")).toBe(false)
    })

    it("returns false for empty / missing input", () => {
      expect(dicomCodec.hasCodec("")).toBe(false)
      expect(dicomCodec.hasCodec(undefined)).toBe(false)
    })
  })

  describe("decode error handling", () => {
    it("throws when transfer syntax UID is unknown", async () => {
      await expect(
        dicomCodec.decode(new Uint8Array([0, 1, 2, 3]), {}, "9.9.9.9")
      ).rejects.toThrow(/unknown transfer syntax/i)
    })
  })

  describe("encode error handling", () => {
    it("throws when transfer syntax UID is unknown", async () => {
      await expect(
        dicomCodec.encode(new Uint8Array([0, 1, 2, 3]), {}, "9.9.9.9")
      ).rejects.toThrow(/unknown transfer syntax/i)
    })
  })

  describe("setConfig", () => {
    it("accepts an empty options object without throwing", () => {
      expect(() => dicomCodec.setConfig()).not.toThrow()
      expect(() => dicomCodec.setConfig({})).not.toThrow()
      expect(() => dicomCodec.setConfig({ verbose: true })).not.toThrow()
    })
  })

  describe("api shape", () => {
    it("exposes the documented surface", () => {
      expect(typeof dicomCodec.decode).toBe("function")
      expect(typeof dicomCodec.encode).toBe("function")
      expect(typeof dicomCodec.transcode).toBe("function")
      expect(typeof dicomCodec.getPixelData).toBe("function")
      expect(typeof dicomCodec.hasCodec).toBe("function")
      expect(typeof dicomCodec.setConfig).toBe("function")
    })
  })
})
