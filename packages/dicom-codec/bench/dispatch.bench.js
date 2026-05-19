// Integration benchmarks: dispatch through dicomCodec.decode() per transfer
// syntax. These measure the full pipeline (UID lookup, codec init, decode,
// imageInfo adapt) for each codec. They require every underlying wasm
// package's dist/ to be present in the workspace; locally without builds,
// the whole suite skips.

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

const fixture = (rel) =>
  skip ? null : readFileSync(resolve(packagesRoot, rel))

const jpeg = !skip
  ? fixture("libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg")
  : null
const jls = !skip
  ? fixture("charls/test/fixtures/CT1.JLS")
  : null
const j2k = !skip
  ? fixture("openjpeg/test/fixtures/j2k/CT1.j2k")
  : null
const j2c = !skip
  ? fixture("openjphjs/test/fixtures/j2c/CT1.j2c")
  : null

describe.skipIf(skip)("dicom-codec dispatch", () => {
  bench("JPEG Baseline 8-bit (1.2.840.10008.1.2.4.50)", async () => {
    await dicomCodec.decode(
      jpeg,
      {
        rows: 800,
        columns: 600,
        bitsAllocated: 8,
        samplesPerPixel: 1,
        pixelRepresentation: 0,
        signed: false,
      },
      "1.2.840.10008.1.2.4.50"
    )
  })

  bench("JPEG-LS Lossless (1.2.840.10008.1.2.4.80)", async () => {
    await dicomCodec.decode(
      jls,
      {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      },
      "1.2.840.10008.1.2.4.80"
    )
  })

  bench("JPEG 2000 Lossless (1.2.840.10008.1.2.4.90)", async () => {
    await dicomCodec.decode(
      j2k,
      {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      },
      "1.2.840.10008.1.2.4.90"
    )
  })

  bench("HTJ2K (1.2.840.10008.1.2.4.201)", async () => {
    await dicomCodec.decode(
      j2c,
      {
        rows: 512,
        columns: 512,
        bitsAllocated: 16,
        samplesPerPixel: 1,
        pixelRepresentation: 1,
        signed: true,
      },
      "1.2.840.10008.1.2.4.201"
    )
  })
})
