import { beforeAll, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")
const fixturesDir = resolve(__dirname, "fixtures/jpeg-xl")

const JPEG_XL_LOSSLESS = "1.2.840.10008.1.2.4.110"
const JPEG_XL = "1.2.840.10008.1.2.4.112"

const REQUIRED = [
  "libjxl/dist/jpegxlwasm_decode.js",
  "libjxl/dist/jpegxlwasm_encode.js",
]
const ALL_BUILT = REQUIRED.every((p) => existsSync(resolve(packagesRoot, p)))

const manifest = JSON.parse(readFileSync(resolve(fixturesDir, "manifest.json"), "utf8"))
const ctFixtures = manifest.fixtures.filter((f) => f.file.startsWith("ct-"))
const wsiFixtures = manifest.fixtures.filter((f) => f.file.startsWith("wsi-"))

function frameBytes(imageFrame) {
  return Buffer.from(imageFrame.buffer, imageFrame.byteOffset ?? 0, imageFrame.byteLength)
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")

const imageInfoOf = (entry) => ({
  rows: entry.rows,
  columns: entry.columns,
  bitsAllocated: entry.bitsAllocated,
  samplesPerPixel: entry.samplesPerPixel,
  pixelRepresentation: entry.pixelRepresentation,
  signed: entry.signed,
})

it.runIf(process.env.CI)("sibling codec dists are present in CI (JPEG XL fixture suite)", () => {
  expect(ALL_BUILT, "codec dists missing — artifacts not replayed").toBe(true)
})

// The fixtures are lossless JPEG XL encodes of real DICOM frames from the
// cornerstone viewer-testdata corpus: sixteen consecutive 16-bit signed CT
// slices, and colour tiles from the one-frame and multi-frame whole-slide
// microscopy instances. See tools/fixture-verification/gen/generate-jpegxl-fixtures.mjs
// for provenance; manifest.json pins the pixels each bitstream must produce.
describe.skipIf(!ALL_BUILT)("JPEG XL fixtures", () => {
  let dicomCodec

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  it("the manifest covers 16 CT frames and 3 colour frames", () => {
    expect(ctFixtures).toHaveLength(16)
    expect(wsiFixtures.map((f) => f.file)).toEqual([
      "wsi-1frame-512x512-f00.jxl",
      "wsi-2frame-512x512-f00.jxl",
      "wsi-2frame-512x512-f01.jxl",
    ])
  })

  describe("decode", () => {
    it.each(manifest.fixtures.map((entry) => [entry.file, entry]))(
      "%s decodes to the pinned pixels",
      async (_file, entry) => {
        const bitstream = readFileSync(resolve(fixturesDir, entry.file))
        const imageInfo = imageInfoOf(entry)
        const result = await dicomCodec.decode(bitstream, imageInfo, JPEG_XL_LOSSLESS)

        expect(result.imageFrame.byteLength).toBe(entry.decodedBytes)
        expect(sha256(frameBytes(result.imageFrame))).toBe(entry.decodedSha256)

        // The codestream carries its own geometry; check the decoder reports
        // it rather than echoing back what the caller passed in.
        expect(result.imageInfo.width).toBe(entry.columns)
        expect(result.imageInfo.height).toBe(entry.rows)
        expect(result.imageInfo.componentCount).toBe(entry.samplesPerPixel)
        expect(result.imageInfo.bitsPerSample).toBe(entry.bitsAllocated)
      }
    )

    // JPEG XL has no signed samples: the decoder always reports isSigned false
    // and the codec re-applies PixelRepresentation from the data set. Without
    // that, every CT slice here would come back as unsigned and read ~63000 HU
    // where it should read -2048.
    it("carries PixelRepresentation through a signed CT decode", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const result = await dicomCodec.decode(
        readFileSync(resolve(fixturesDir, entry.file)),
        imageInfo,
        JPEG_XL_LOSSLESS
      )

      expect(result.imageInfo.signed).toBe(true)
      expect(result.imageInfo.pixelRepresentation).toBe(1)

      const pixelData = dicomCodec.getPixelData(result.imageFrame, imageInfo, JPEG_XL_LOSSLESS)
      expect(pixelData.constructor.name).toBe("Int16Array")
      expect(pixelData).toHaveLength(entry.rows * entry.columns)

      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (const value of pixelData) {
        if (value < min) min = value
        if (value > max) max = value
      }
      expect(min).toBe(-2048)
      expect(max).toBe(1704)
    })

    it("returns interleaved 8-bit RGB for a colour WSI frame", async () => {
      const entry = wsiFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const result = await dicomCodec.decode(
        readFileSync(resolve(fixturesDir, entry.file)),
        imageInfo,
        JPEG_XL_LOSSLESS
      )

      const pixelData = dicomCodec.getPixelData(result.imageFrame, imageInfo, JPEG_XL_LOSSLESS)
      expect(pixelData.constructor.name).toBe("Uint8Array")
      expect(pixelData).toHaveLength(entry.rows * entry.columns * 3)
      expect(result.imageInfo.signed).toBe(false)
    })
  })

  // The .raw references are the two frames a failure is most useful to see as
  // a byte diff rather than as a changed hash.
  describe("committed pixel references", () => {
    it.each([
      ["ct-512x512-s00", "signed 16-bit CT slice"],
      ["wsi-1frame-512x512-f00", "8-bit RGB WSI tile"],
    ])("%s decodes byte-exactly to its .raw reference (%s)", async (name) => {
      const entry = manifest.fixtures.find((f) => f.file === `${name}.jxl`)
      const reference = readFileSync(resolve(fixturesDir, `${name}.raw`))
      const result = await dicomCodec.decode(
        readFileSync(resolve(fixturesDir, entry.file)),
        imageInfoOf(entry),
        JPEG_XL_LOSSLESS
      )
      expect(frameBytes(result.imageFrame).equals(reference)).toBe(true)
    })
  })

  describe("re-encode", () => {
    // Encoding the decoded pixels again must reproduce the same samples. This
    // is the property the fixtures were generated under, so a change to either
    // half of the codec that breaks it shows up here.
    it.each([
      ["ct-512x512-s00.jxl", "16-bit signed greyscale"],
      ["wsi-2frame-512x512-f00.jxl", "8-bit RGB"],
    ])("%s survives a decode/encode/decode round trip (%s)", async (file) => {
      const entry = manifest.fixtures.find((f) => f.file === file)
      const imageInfo = imageInfoOf(entry)

      const decoded = await dicomCodec.decode(
        readFileSync(resolve(fixturesDir, file)),
        imageInfo,
        JPEG_XL_LOSSLESS
      )
      const reencoded = await dicomCodec.encode(
        decoded.imageFrame,
        imageInfo,
        JPEG_XL_LOSSLESS
      )
      const redecoded = await dicomCodec.decode(
        reencoded.imageFrame,
        imageInfo,
        JPEG_XL_LOSSLESS
      )

      expect(sha256(frameBytes(redecoded.imageFrame))).toBe(entry.decodedSha256)
    })

    it("encodes every CT slice losslessly", async () => {
      for (const entry of ctFixtures) {
        const imageInfo = imageInfoOf(entry)
        const decoded = await dicomCodec.decode(
          readFileSync(resolve(fixturesDir, entry.file)),
          imageInfo,
          JPEG_XL_LOSSLESS
        )
        const encoded = await dicomCodec.encode(decoded.imageFrame, imageInfo, JPEG_XL_LOSSLESS)
        const redecoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, JPEG_XL_LOSSLESS)
        expect(sha256(frameBytes(redecoded.imageFrame)), entry.file).toBe(entry.decodedSha256)
      }
    })
  })

  describe("lossy (.112)", () => {
    // .112 is the lossy-capable transfer syntax. A distance of 1.0 is
    // "visually lossless" and must still round trip the geometry exactly and
    // land close to the source, which is what separates a working lossy path
    // from one that mangles samples (e.g. by mis-handling the sign).
    it("encodes a colour frame lossily and decodes it back to the same geometry", async () => {
      const entry = wsiFixtures[1]
      const imageInfo = imageInfoOf(entry)

      const source = await dicomCodec.decode(
        readFileSync(resolve(fixturesDir, entry.file)),
        imageInfo,
        JPEG_XL_LOSSLESS
      )
      const encoded = await dicomCodec.encode(source.imageFrame, imageInfo, JPEG_XL, {
        lossless: false,
        distance: 1.0,
      })
      const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, JPEG_XL)

      expect(decoded.imageFrame.byteLength).toBe(entry.decodedBytes)
      expect(frameBytes(encoded.imageFrame).length).toBeLessThan(entry.encodedBytes)

      const before = frameBytes(source.imageFrame)
      const after = frameBytes(decoded.imageFrame)
      let error = 0
      for (let i = 0; i < before.length; i++) error += Math.abs(before[i] - after[i])
      expect(error / before.length).toBeLessThan(3)
    })

    // KNOWN BUG: jpegxl.js hands the encoder `isSigned: false` without first
    // offsetting signed samples into unsigned range, so the two's-complement
    // bit patterns of a signed CT slice reach libjxl as unsigned values. The
    // frame's real range of [-2048, 1704] becomes two clusters, [0, 1704] and
    // [63488, 65535], with a 62 000-count cliff between them that the lossy
    // VarDCT path smears across.
    //
    // The lossless path is unaffected (modular stores the integers verbatim,
    // which is why every other test here passes), and so is colour, which is
    // genuinely unsigned. Measured at distance 1.0, "visually lossless": max
    // absolute error 2211 HU against a total range of 3752, mean 69.5 HU —
    // wider than soft-tissue contrast.
    //
    // The fix is to add 2^(bitsStored-1) before encoding and subtract it after
    // decoding, which is what the C++ guard in JpegXLEncoder::validate asks the
    // caller to do. When that lands this test starts passing, vitest flags it,
    // and it should become a real error bound.
    it.fails("encodes signed CT lossily without mangling it (known signed-sample bug)", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))

      const encoded = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL, {
        lossless: false,
        distance: 1.0,
      })
      const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, JPEG_XL)

      const before = new Int16Array(reference.buffer, reference.byteOffset, reference.length / 2)
      const bytes = frameBytes(decoded.imageFrame)
      const after = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)

      let maxError = 0
      for (let i = 0; i < before.length; i++) {
        maxError = Math.max(maxError, Math.abs(before[i] - after[i]))
      }
      // Distance 1.0 on 16-bit CT should stay within a few tens of HU.
      expect(maxError).toBeLessThan(100)
    })

    // Paired with the above: pins that `{ lossless: false }` with no distance
    // is currently the worst of both worlds. jpegxl.js passes the option
    // through but never calls setDistance, leaving the C++ default distance_
    // of 0.0f — so libjxl runs VarDCT at distance 0 instead of the modular
    // lossless path. The result is BIGGER than the lossless encode and still
    // not lossless. Either default `distance` to something lossy (1.0 is the
    // usual "visually lossless"), or reject the combination.
    it("documents that { lossless: false } with no distance is larger than lossless", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))

      const encoded = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL, {
        lossless: false,
      })
      expect(encoded.imageFrame.byteLength).toBeGreaterThan(entry.encodedBytes)
    })
  })
})
