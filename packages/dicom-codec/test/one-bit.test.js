import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import codecFactory from "../src/codecs/codecFactory.js"
import {
  bilevelFromCT2,
  packBitsLsbFirst,
} from "../../../tools/fixture-verification/gen/derive.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const REQUIRED = ["openjphjs/dist/openjphjs.js", "openjpeg/dist/openjpegjs.js"]
const ALL_BUILT = REQUIRED.every((p) => existsSync(resolve(packagesRoot, p)))

function frameBytes(imageFrame) {
  return Buffer.from(imageFrame.buffer, imageFrame.byteOffset ?? 0, imageFrame.byteLength)
}

it.runIf(process.env.CI)("sibling codec dists are present in CI (1-bit suite)", () => {
  expect(ALL_BUILT, "codec dists missing — artifacts not replayed").toBe(true)
})

// BitsAllocated=1 is the one depth where the caller's frame and the encoder's
// input buffer are not the same shape. DICOM packs the samples eight to a byte
// (first sample in the least significant bit, PS3.5 8.1.1); every wasm encoder
// sizes its input at (bitsPerSample + 7) / 8 == 1 byte per sample and reads one
// sample per byte. codecFactory bridges the two — these pin that it does.
describe("codecFactory 1-bit sample layout", () => {
  it("unpacks bit-packed samples least-significant-bit first", () => {
    // 0x01 -> sample 0 set; 0x80 -> sample 15 set. LSB-first, so the low bit of
    // the first byte is pixel 0, not pixel 7.
    const packed = Uint8Array.from([0b00000001, 0b10000000])
    expect(Array.from(codecFactory.unpackBits(packed, 16))).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1,
    ])
  })

  it("unpacks a trailing partial byte without reading past the sample count", () => {
    const packed = Uint8Array.from([0b11111111])
    expect(Array.from(codecFactory.unpackBits(packed, 3))).toEqual([1, 1, 1])
  })

  it("round-trips against the packer used to build the fixtures", () => {
    const samples = Uint8Array.from({ length: 1000 }, (_, i) => (i % 7 === 0 ? 1 : 0))
    const packed = packBitsLsbFirst(samples)
    expect(packed.length).toBe(125)
    expect(Array.from(codecFactory.unpackBits(packed, samples.length))).toEqual(
      Array.from(samples)
    )
  })

  it("throws rather than silently zero-filling when the packed frame is short", () => {
    expect(() => codecFactory.unpackBits(new Uint8Array(3), 64)).toThrow(
      /Bit-packed frame is too short: 3 bytes for 64 samples \(need 8\)/
    )
  })

  it("expands a packed 1-bit frame to fill the encoder buffer", () => {
    const samples = Uint8Array.from({ length: 64 }, (_, i) => i & 1)
    const packed = packBitsLsbFirst(samples)
    const layout = codecFactory.toEncoderLayout(packed, { bitsPerSample: 1 }, 64)
    expect(layout.length).toBe(64)
    expect(Array.from(layout)).toEqual(Array.from(samples))
  })

  it("passes an already-unpacked 1-bit frame through, so transcoding does not unpack twice", () => {
    // What the decoders emit for BitsAllocated=1: one clamped byte per sample,
    // exactly as for every other depth up to 8.
    const samples = Uint8Array.from({ length: 64 }, (_, i) => i & 1)
    expect(codecFactory.toEncoderLayout(samples, { bitsPerSample: 1 }, 64)).toBe(samples)
  })

  it("reads a packed frame handed over as a wider view as bytes", () => {
    // A caller holding PixelData as a Uint16Array has the same packed bytes in
    // the same order; counting its elements instead would see half the data.
    const samples = Uint8Array.from({ length: 64 }, (_, i) => i & 1)
    const packed = packBitsLsbFirst(samples)
    const asWords = new Uint16Array(packed.buffer, packed.byteOffset, packed.byteLength / 2)
    expect(asWords.length).toBe(4)
    const layout = codecFactory.toEncoderLayout(asWords, { bitsPerSample: 1 }, 64)
    expect(Array.from(layout)).toEqual(Array.from(samples))
  })

  it("leaves frames at every other depth alone", () => {
    const frame = new Uint16Array(64)
    expect(codecFactory.toEncoderLayout(frame, { bitsPerSample: 16 }, 128)).toBe(frame)
    const bytes = new Uint8Array(64)
    expect(codecFactory.toEncoderLayout(bytes, { bitsPerSample: 8 }, 64)).toBe(bytes)
  })
})

describe.skipIf(!ALL_BUILT)("dicom-codec 1-bit encode/decode", () => {
  let dicomCodec
  // A CT silhouette rather than noise or a pattern: long runs broken by an
  // irregular boundary, so a stride or bit-order mistake shows up instead of
  // being masked by uniform content.
  const ct2 = readFileSync(resolve(packagesRoot, "charls/test/fixtures/CT2.RAW"))
  const samples = bilevelFromCT2(ct2)
  const packed = packBitsLsbFirst(samples)
  const imageInfo = {
    rows: 512,
    columns: 512,
    bitsAllocated: 1,
    samplesPerPixel: 1,
    pixelRepresentation: 0,
    signed: false,
  }

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  it("derives a packed frame an eighth the size of the sample count", () => {
    expect(samples.length).toBe(512 * 512)
    expect(packed.length).toBe((512 * 512) / 8)
  })

  // The two codecs whose formats carry a 1-bit component. JPEG-LS is not in the
  // list on purpose: CharLS rejects bit depths below 2 outright.
  it.each([
    { name: "HTJ2K Lossless", uid: "1.2.840.10008.1.2.4.201" },
    { name: "JPEG 2000 Lossless", uid: "1.2.840.10008.1.2.4.90" },
  ])("encodes a bit-packed frame to $name ($uid) and decodes it back losslessly", async ({ uid }) => {
    // Without the unpack in codecFactory.encode this passes bit-packed bytes to
    // an encoder expecting one sample per byte: 1/8 of the buffer holds bytes
    // that each carry eight unrelated pixels and 7/8 stays zero. The encode
    // still succeeds, which is what makes it worth a test.
    const encoded = await dicomCodec.encode(packed, imageInfo, uid)
    expect(encoded.imageFrame.length).toBeGreaterThan(0)

    const decoded = await dicomCodec.decode(encoded.imageFrame, imageInfo, uid)
    expect(decoded.processInfo.partial).toBeUndefined()
    expect(decoded.imageInfo.bitsPerSample).toBe(1)
    expect(decoded.imageInfo.rows).toBe(512)
    expect(decoded.imageInfo.columns).toBe(512)

    // One byte per sample on the way out, values 0/1 — not repacked.
    const out = frameBytes(decoded.imageFrame)
    expect(out.length).toBe(512 * 512)
    expect(out.equals(Buffer.from(samples.buffer, 0, samples.byteLength))).toBe(true)
  })

  it("transcodes 1-bit native little endian to HTJ2K and back", async () => {
    const transcoded = await dicomCodec.transcode(
      packed,
      imageInfo,
      "1.2.840.10008.1.2.1",
      "1.2.840.10008.1.2.4.201"
    )
    const decoded = await dicomCodec.decode(
      transcoded.imageFrame,
      imageInfo,
      "1.2.840.10008.1.2.4.201"
    )
    expect(frameBytes(decoded.imageFrame).equals(Buffer.from(samples.buffer, 0, samples.byteLength))).toBe(true)
  })

  it("re-encodes an already-decoded 1-bit frame without unpacking it again", async () => {
    // The decoders hand back one byte per sample, so encode() sees a frame that
    // is already in the encoder's layout. Unpacking that would read 8x past the
    // end; passing it through has to round-trip unchanged.
    const first = await dicomCodec.encode(packed, imageInfo, "1.2.840.10008.1.2.4.201")
    const decoded = await dicomCodec.decode(first.imageFrame, imageInfo, "1.2.840.10008.1.2.4.201")
    const second = await dicomCodec.encode(
      decoded.imageFrame,
      decoded.imageInfo,
      "1.2.840.10008.1.2.4.201"
    )
    const again = await dicomCodec.decode(second.imageFrame, imageInfo, "1.2.840.10008.1.2.4.201")
    expect(frameBytes(again.imageFrame).equals(Buffer.from(samples.buffer, 0, samples.byteLength))).toBe(true)
  })

  it("getPixelData returns the packed bytes unchanged for native transfer syntaxes", () => {
    // 1-bit PixelData stays bit-packed through the native codecs: unpacking is
    // the renderer's job, and multi-frame 1-bit data is packed across frame
    // boundaries so it cannot be split here either.
    for (const uid of ["1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"]) {
      const pixelData = dicomCodec.getPixelData(packed, imageInfo, uid)
      expect(pixelData, uid).toBe(packed)
    }
  })
})

// The big-endian codec's getPixelData handled only 8 and 16 bit, returning
// undefined for the 1- and 32-bit datasets its own decode() accepts.
describe("bigEndian getPixelData depth coverage", () => {
  let dicomCodec
  const BIG_ENDIAN = "1.2.840.10008.1.2.2"

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  it("returns the frame itself for bitsAllocated 1", () => {
    const frame = Uint8Array.from([0b10101010, 0b01010101])
    const imageInfo = { rows: 4, columns: 4, bitsAllocated: 1, samplesPerPixel: 1, pixelRepresentation: 0 }
    expect(dicomCodec.getPixelData(frame, imageInfo, BIG_ENDIAN)).toBe(frame)
  })

  it.each([
    { pixelRepresentation: 0, ctor: "Uint32Array" },
    { pixelRepresentation: 1, ctor: "Int32Array" },
    { pixelRepresentation: undefined, ctor: "Float32Array" },
  ])(
    "byte-swaps bitsAllocated 32 into $ctor for pixelRepresentation=$pixelRepresentation",
    ({ pixelRepresentation, ctor }) => {
      // Bytes 01 02 03 04 are the big-endian encoding of 0x01020304, and the
      // typed arrays below read little endian, so the swap has to leave
      // 0x01020304 in the word.
      const frame = Uint8Array.from([0x01, 0x02, 0x03, 0x04])
      const imageInfo = { rows: 1, columns: 1, bitsAllocated: 32, samplesPerPixel: 1, pixelRepresentation }
      const pixelData = dicomCodec.getPixelData(frame, imageInfo, BIG_ENDIAN)
      expect(pixelData.constructor.name).toBe(ctor)
      expect(pixelData.length).toBe(1)
      expect(new Uint32Array(pixelData.buffer, pixelData.byteOffset, 1)[0]).toBe(0x01020304)
    }
  )
})
