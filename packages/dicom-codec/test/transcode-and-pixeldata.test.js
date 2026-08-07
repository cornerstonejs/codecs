import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const REQUIRED = [
  "charls/dist/charlsjs.js",
]
const ALL_BUILT = REQUIRED.every((p) => existsSync(resolve(packagesRoot, p)))

function frameBytes(imageFrame) {
  return Buffer.from(imageFrame.buffer, imageFrame.byteOffset ?? 0, imageFrame.byteLength)
}

it.runIf(process.env.CI)("sibling codec dists are present in CI (transcode suite)", () => {
  expect(ALL_BUILT, "codec dists missing — artifacts not replayed").toBe(true)
})

describe.skipIf(!ALL_BUILT)("dicom-codec encode", () => {
  let dicomCodec
  const ct1Raw = readFileSync(resolve(packagesRoot, "openjpeg/test/fixtures/raw/CT1.RAW"))
  const ctImageInfo = {
    rows: 512,
    columns: 512,
    bitsAllocated: 16,
    samplesPerPixel: 1,
    pixelRepresentation: 1,
    signed: true,
  }

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  it("encode() to JPEG-LS Lossless (.80) round-trips byte-exact", async () => {
    const encoded = await dicomCodec.encode(new Uint8Array(ct1Raw), ctImageInfo, "1.2.840.10008.1.2.4.80")
    const decoded = await dicomCodec.decode(encoded.imageFrame, ctImageInfo, "1.2.840.10008.1.2.4.80")
    expect(frameBytes(decoded.imageFrame).equals(ct1Raw)).toBe(true)
  })
})

describe.skipIf(!ALL_BUILT)("dicom-codec getPixelData typed-array contract", () => {
  let dicomCodec
  const ct1Jls = readFileSync(resolve(packagesRoot, "charls/test/fixtures/CT1.JLS"))

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  // Pins the constructor returned per (bitsAllocated, pixelRepresentation)
  // for the JPEG-LS codec path — the contract plan 008 hardens.
  it.each([
    { bitsAllocated: 16, pixelRepresentation: 1, ctor: "Int16Array" },
    { bitsAllocated: 16, pixelRepresentation: 0, ctor: "Uint16Array" },
  ])(
    "returns $ctor for bitsAllocated=$bitsAllocated pixelRepresentation=$pixelRepresentation",
    async ({ bitsAllocated, pixelRepresentation, ctor }) => {
      const imageInfo = {
        rows: 512,
        columns: 512,
        bitsAllocated,
        samplesPerPixel: 1,
        pixelRepresentation,
        signed: pixelRepresentation === 1,
      }
      const decoded = await dicomCodec.decode(ct1Jls, imageInfo, "1.2.840.10008.1.2.4.80")
      const pixelData = dicomCodec.getPixelData(decoded.imageFrame, imageInfo, "1.2.840.10008.1.2.4.80")
      expect(pixelData.constructor.name).toBe(ctor)
      expect(pixelData.length).toBe(512 * 512)
    }
  )
})
