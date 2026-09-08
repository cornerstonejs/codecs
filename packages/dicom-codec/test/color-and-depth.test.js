import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { gray8FromCT2 } from "../../../tools/fixture-verification/gen/derive.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const REQUIRED = [
  "libjpeg-turbo-8bit/dist/libjpegturbojs.js",
  "charls/dist/charlsjs.js",
]
const ALL_BUILT = REQUIRED.every((p) => existsSync(resolve(packagesRoot, p)))

function frameBytes(imageFrame) {
  return Buffer.from(imageFrame.buffer, imageFrame.byteOffset ?? 0, imageFrame.byteLength)
}

it.runIf(process.env.CI)("sibling codec dists are present in CI (color/depth suite)", () => {
  expect(ALL_BUILT, "codec dists missing — artifacts not replayed").toBe(true)
})

// Color and non-16-bit paths through the dispatcher. Every reference is
// either a DCMTK-verified golden (color JPEG), the lossless source itself
// (RLE, JLS), or a deterministic derivation (derive.mjs).
describe.skipIf(!ALL_BUILT)("dicom-codec color and bit-depth dispatch", () => {
  let dicomCodec
  const us1 = readFileSync(resolve(packagesRoot, "openjpeg/test/fixtures/raw/US1.RAW"))

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
  })

  it("decodes a color 4:2:0 JPEG (.50, samplesPerPixel 3) to the DCMTK-verified pixels", async () => {
    const jpegBytes = readFileSync(
      resolve(packagesRoot, "libjpeg-turbo-8bit/test/fixtures/jpeg/US1-color-420.jpg")
    )
    const golden = readFileSync(
      resolve(packagesRoot, "libjpeg-turbo-8bit/test/fixtures/raw/US1-color-420.raw")
    )
    const result = await dicomCodec.decode(
      jpegBytes,
      { rows: 480, columns: 640, bitsAllocated: 8, samplesPerPixel: 3, pixelRepresentation: 0, signed: false },
      "1.2.840.10008.1.2.4.50"
    )
    expect(result.imageFrame.byteLength).toBe(640 * 480 * 3)
    expect(frameBytes(result.imageFrame).equals(golden)).toBe(true)
  })

  it("decodes color RLE (3 segments) interleaved when planarConfiguration is 0", async () => {
    const rleBytes = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/rle/US1-color.rle")
    )
    const result = await dicomCodec.decode(
      new Uint8Array(rleBytes),
      { rows: 480, columns: 640, bitsAllocated: 8, samplesPerPixel: 3, planarConfiguration: 0 },
      "1.2.840.10008.1.2.5"
    )
    expect(frameBytes(result.imageFrame).equals(us1)).toBe(true)
  })

  it("decodes color RLE plane-sequential when planarConfiguration is 1", async () => {
    const rleBytes = readFileSync(
      resolve(packagesRoot, "dicom-codec/test/fixtures/rle/US1-color.rle")
    )
    const result = await dicomCodec.decode(
      new Uint8Array(rleBytes),
      { rows: 480, columns: 640, bitsAllocated: 8, samplesPerPixel: 3, planarConfiguration: 1 },
      "1.2.840.10008.1.2.5"
    )
    const out = frameBytes(result.imageFrame)
    expect(out.length).toBe(us1.length)
    // expected layout: RRR...GGG...BBB (de-interleaved planes of US1)
    const frameSize = 640 * 480
    const planar = Buffer.alloc(us1.length)
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < frameSize; i++) planar[s * frameSize + i] = us1[i * 3 + s]
    }
    expect(out.equals(planar)).toBe(true)
  })

  it("decodes an 8-bit JPEG-LS (.80) through the dispatcher losslessly", async () => {
    const jls = readFileSync(resolve(packagesRoot, "charls/test/fixtures/CT2-gray8.jls"))
    const ct2 = readFileSync(resolve(packagesRoot, "charls/test/fixtures/CT2.RAW"))
    const expected = gray8FromCT2(ct2)
    const result = await dicomCodec.decode(
      jls,
      { rows: 512, columns: 512, bitsAllocated: 8, samplesPerPixel: 1, pixelRepresentation: 0, signed: false },
      "1.2.840.10008.1.2.4.80"
    )
    expect(frameBytes(result.imageFrame).equals(Buffer.from(expected.buffer, 0, expected.byteLength))).toBe(true)
  })
})
