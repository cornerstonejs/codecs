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

    // Pins the encoder's output, not just the decoder's. The manifest hashes
    // would still pass if the encoder changed and the decoder changed with
    // it; this catches a codestream that is merely equivalent rather than
    // identical, which is what a libjxl bump or an option-plumbing slip
    // produces. It is also the check that says the .110 path is untouched by
    // the .112 level shift.
    it.each([
      ["ct-512x512-s00", "signed 16-bit CT slice"],
      ["wsi-1frame-512x512-f00", "8-bit RGB WSI tile"],
    ])("%s re-encodes to the committed bitstream byte-for-byte (%s)", async (name) => {
      const entry = manifest.fixtures.find((f) => f.file === `${name}.jxl`)
      const reference = readFileSync(resolve(fixturesDir, `${name}.raw`))
      const committed = readFileSync(resolve(fixturesDir, entry.file))

      const encoded = await dicomCodec.encode(
        new Uint8Array(reference),
        imageInfoOf(entry),
        JPEG_XL_LOSSLESS
      )
      expect(frameBytes(encoded.imageFrame).equals(committed)).toBe(true)
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

    // JPEG XL cannot signal PixelRepresentation, so .112 shifts signed
    // samples into unsigned range before encoding and shifts them back after
    // decoding (see jpegxl.js). The contract that matters is that doing so
    // automatically is indistinguishable from a caller doing it by hand —
    // the codec must add the level shift and nothing else.
    it("auto-offset of signed samples matches a caller pre-shifting by hand", async () => {
      const entry = ctFixtures[0]
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))
      const signedInfo = imageInfoOf(entry)
      const unsignedInfo = { ...signedInfo, pixelRepresentation: 0, signed: false }

      // The same frame, level-shifted into unsigned range by the caller.
      const preShifted = new Uint8Array(reference.byteLength)
      const source = new DataView(reference.buffer, reference.byteOffset, reference.byteLength)
      const target = new DataView(preShifted.buffer)
      for (let i = 0; i < reference.byteLength; i += 2) {
        target.setUint16(i, source.getInt16(i, true) + 32768, true)
      }

      for (const distance of [0.5, 1.0]) {
        const auto = await dicomCodec.encode(new Uint8Array(reference), signedInfo, JPEG_XL, {
          lossless: false,
          distance,
        })
        const byHand = await dicomCodec.encode(preShifted, unsignedInfo, JPEG_XL, {
          lossless: false,
          distance,
        })
        expect(frameBytes(auto.imageFrame).equals(frameBytes(byHand.imageFrame)), `distance ${distance}`).toBe(true)
      }
    })

    // Lossless through .112 exercises the shift in both directions without a
    // lossy step in between, so it must be exactly invertible.
    it("round-trips signed CT exactly through .112 with the default options", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))

      const encoded = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL)
      const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, JPEG_XL)
      expect(frameBytes(decoded.imageFrame).equals(reference)).toBe(true)
    })

    // Without the level shift, a CT frame reaches libjxl as [0, 1704] plus
    // [63488, 65535] and lossy coding smears across the cliff between them:
    // 2211 HU of maximum error at distance 1.0, against a total range of
    // 3752. The bound below is far inside that, and error must fall as
    // distance falls — the property a cliff destroys.
    it("keeps lossy error bounded and monotone in distance for signed CT", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))
      const before = new Int16Array(reference.buffer, reference.byteOffset, reference.byteLength / 2)

      const errors = []
      for (const distance of [0.1, 0.5, 1.0]) {
        const encoded = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL, {
          lossless: false,
          distance,
        })
        const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, JPEG_XL)
        const bytes = frameBytes(decoded.imageFrame)
        const after = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)

        let maxError = 0
        for (let i = 0; i < before.length; i++) {
          maxError = Math.max(maxError, Math.abs(before[i] - after[i]))
        }
        errors.push({ distance, maxError, bytes: encoded.imageFrame.byteLength })
      }

      // Butteraugli distance is relative to the full 16-bit range, and CT
      // occupies about 6% of it, so absolute HU error stays sizeable even at
      // "visually lossless" — callers wanting tight HU bounds want a small
      // distance or .110. What must hold is that it is bounded and ordered.
      expect(errors[0].maxError).toBeLessThan(300)
      expect(errors[0].maxError).toBeLessThan(errors[1].maxError)
      expect(errors[1].maxError).toBeLessThan(errors[2].maxError)
      expect(errors[0].bytes).toBeGreaterThan(errors[2].bytes)
    })

    // { lossless: false } with no distance used to leave the C++ default of
    // 0.0f in place, so libjxl ran VarDCT at distance 0: bigger than the
    // lossless encode (245685 vs 193274 bytes) and still not lossless. It now
    // defaults to 1.0, cjxl's default.
    it("defaults { lossless: false } to distance 1.0", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))

      const implicit = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL, {
        lossless: false,
      })
      const explicit = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL, {
        lossless: false,
        distance: 1.0,
      })

      expect(frameBytes(implicit.imageFrame).equals(frameBytes(explicit.imageFrame))).toBe(true)
      expect(implicit.imageFrame.byteLength).toBeLessThan(entry.encodedBytes)
    })
  })

  // .110 promises to preserve the bits of the original image, so it hands the
  // two's complement pattern straight to libjxl and gets it back unchanged.
  // Only .112 applies the level shift. Both are exact; they differ in what a
  // third-party decoder reading the bare codestream sees.
  describe("transfer syntax sample conventions", () => {
    it("encodes signed CT differently under .110 and .112, both losslessly", async () => {
      const entry = ctFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const reference = readFileSync(resolve(fixturesDir, "ct-512x512-s00.raw"))

      const lossless = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL_LOSSLESS)
      const lossy = await dicomCodec.encode(new Uint8Array(reference), imageInfo, JPEG_XL)
      expect(frameBytes(lossless.imageFrame).equals(frameBytes(lossy.imageFrame))).toBe(false)

      for (const [encoded, uid] of [
        [lossless, JPEG_XL_LOSSLESS],
        [lossy, JPEG_XL],
      ]) {
        const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, uid)
        expect(frameBytes(decoded.imageFrame).equals(reference), uid).toBe(true)
      }
    })

    it("leaves unsigned colour frames untouched under both", async () => {
      const entry = wsiFixtures[0]
      const imageInfo = imageInfoOf(entry)
      const source = readFileSync(resolve(fixturesDir, "wsi-1frame-512x512-f00.raw"))

      const lossless = await dicomCodec.encode(new Uint8Array(source), imageInfo, JPEG_XL_LOSSLESS)
      const lossy = await dicomCodec.encode(new Uint8Array(source), imageInfo, JPEG_XL)
      expect(frameBytes(lossless.imageFrame).equals(frameBytes(lossy.imageFrame))).toBe(true)
    })
  })
})
