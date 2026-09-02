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
  "libjxl/dist/jpegxlwasm_decode.js",
  "libjxl/dist/jpegxlwasm_encode.js",
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

// 512x512 interleaved 8-bit RGB (the WSI colour fixtures)
const rgb512 = {
  rows: 512,
  columns: 512,
  bitsAllocated: 8,
  samplesPerPixel: 3,
  pixelRepresentation: 0,
  signed: false,
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
      "JPEG XL Lossless (.110)": [
        read("dicom-codec/test/fixtures/jpeg-xl/ct-512x512-s00.jxl"),
        ctSigned512,
        "1.2.840.10008.1.2.4.110",
      ],
      // Colour, so it exercises the 3-component path the CT fixtures do not.
      "JPEG XL Lossless colour (.110)": [
        read("dicom-codec/test/fixtures/jpeg-xl/wsi-2frame-512x512-f00.jxl"),
        rgb512,
        "1.2.840.10008.1.2.4.110",
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

describe.skipIf(skip)("dicom-codec encode/transcode dispatch", () => {
  const ct1Raw = skip ? null : read("openjpeg/test/fixtures/raw/CT1.RAW")
  const ct1Jls = skip ? null : read("charls/test/fixtures/CT1.JLS")

  bench("encode to JPEG-LS Lossless (.80)", async () => {
    await dicomCodec.encode(new Uint8Array(ct1Raw), ctSigned512, "1.2.840.10008.1.2.4.80")
  })

  bench("encode to JPEG 2000 Lossless (.90)", async () => {
    await dicomCodec.encode(new Uint8Array(ct1Raw), ctSigned512, "1.2.840.10008.1.2.4.90")
  })

  bench("encode to JPEG XL Lossless (.110)", async () => {
    await dicomCodec.encode(new Uint8Array(ct1Raw), ctSigned512, "1.2.840.10008.1.2.4.110")
  })

  // .112 with signed data goes through the level shift dicom-codec applies
  // because JPEG XL cannot signal PixelRepresentation, so this measures the
  // shift as well as the lossy encode.
  bench("encode to JPEG XL lossy d=1.0 (.112)", async () => {
    await dicomCodec.encode(new Uint8Array(ct1Raw), ctSigned512, "1.2.840.10008.1.2.4.112", {
      lossless: false,
      distance: 1.0,
    })
  })

  bench("transcode JPEG-LS -> J2K (.80 -> .90)", async () => {
    await dicomCodec.transcode(ct1Jls, ctSigned512, "1.2.840.10008.1.2.4.80", "1.2.840.10008.1.2.4.90")
  })

  bench("transcode JPEG-LS -> JPEG XL (.80 -> .110)", async () => {
    await dicomCodec.transcode(ct1Jls, ctSigned512, "1.2.840.10008.1.2.4.80", "1.2.840.10008.1.2.4.110")
  })
})
