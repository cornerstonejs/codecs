// Integration benchmarks: dispatch through dicomCodec.decode() per transfer
// syntax. Measures the full pipeline (UID lookup, codec init, decode,
// imageInfo adapt) for every codec we have a fixture for. Requires every
// underlying wasm package's dist/ to be present in the workspace — locally
// without builds, the whole suite skips.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const REQUIRED = [
  "charls/dist/charlsjs.js",
  "libjpeg-turbo-8bit/dist/libjpegturbojs.js",
  "openjpeg/dist/openjpegjs.js",
  "openjphjs/dist/openjphjs.js",
]
const skip = !REQUIRED.every((p) => existsSync(resolve(packagesRoot, p)))

let dicomCodec
if (!skip) {
  const mod = await import("../src/index.js")
  dicomCodec = mod.default ?? mod
}

const read = (rel) => (skip ? null : readFileSync(resolve(packagesRoot, rel)))

// CT-style 512x512 16-bit signed (for the .57/.70/.81/.91/.5/.201 fixtures)
const ctSigned512 = {
  rows: 512,
  columns: 512,
  bitsAllocated: 16,
  samplesPerPixel: 1,
  pixelRepresentation: 1,
  signed: true,
}

// 8-bit JFIF (800x600)
const jpeg8bitInfo = {
  rows: 800,
  columns: 600,
  bitsAllocated: 8,
  samplesPerPixel: 1,
  pixelRepresentation: 0,
  signed: false,
}

const fixtures = skip
  ? {}
  : {
      "JPEG Baseline 8-bit (.50)": [
        read("libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg"),
        jpeg8bitInfo,
        "1.2.840.10008.1.2.4.50",
      ],
      "JPEG Lossless P14 (.57)": [
        read("dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14.jpll"),
        ctSigned512,
        "1.2.840.10008.1.2.4.57",
      ],
      "JPEG Lossless P14 SV1 (.70)": [
        read("dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14-sv1.jpll"),
        ctSigned512,
        "1.2.840.10008.1.2.4.70",
      ],
      "JPEG-LS Lossless (.80)": [
        read("charls/test/fixtures/CT1.JLS"),
        ctSigned512,
        "1.2.840.10008.1.2.4.80",
      ],
      "JPEG-LS Near-Lossless (.81)": [
        read("charls/test/fixtures/CT-512x512-near-lossless.JLS"),
        ctSigned512,
        "1.2.840.10008.1.2.4.81",
      ],
      "JPEG 2000 Lossless (.90)": [
        read("openjpeg/test/fixtures/j2k/CT1.j2k"),
        ctSigned512,
        "1.2.840.10008.1.2.4.90",
      ],
      "JPEG 2000 Lossy (.91)": [
        read("openjpeg/test/fixtures/j2k/CT-512x512-lossy.j2k"),
        ctSigned512,
        "1.2.840.10008.1.2.4.91",
      ],
      "HTJ2K Lossless (.201)": [
        read("openjphjs/test/fixtures/j2c/CT1.j2c"),
        ctSigned512,
        "1.2.840.10008.1.2.4.201",
      ],
      "RLE Lossless (.5)": [
        read("dicom-codec/test/fixtures/rle/CT-512x512.rle"),
        ctSigned512,
        "1.2.840.10008.1.2.5",
      ],
    }

describe.skipIf(skip)("dicom-codec dispatch", () => {
  for (const [label, [bytes, info, uid]] of Object.entries(fixtures)) {
    bench(label, async () => {
      await dicomCodec.decode(bytes, info, uid)
    })
  }
})
