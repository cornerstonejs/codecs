// Cold vs warm decoder/encoder benches, matching the shape of the charls and
// openjphjs suites.
//
// "cold" = a fresh instance whose first decode()/encode() happens INSIDE the
// bench body, modelling frame 1 of a worker session. "warm" = a shared
// instance given 5 untimed passes at module load, modelling frames 2..N,
// which is the dominant production case. Bench bodies are otherwise
// identical, so the cold/warm delta isolates first-call setup (wasm heap
// grow, page-touch, V8 tier-up) from kernel time.
//
// Warmup uses the CT fixture, the largest of the three, so the warm
// instances' buffers never regrow when the smaller colour fixture runs.
//
// Fixtures come from dicom-codec rather than being duplicated here — they are
// the same frames its JPEG XL suite pins, so a decode regression shows up in
// both places against identical bytes. dispatch.bench.js already reads across
// packages the same way.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../../dicom-codec/test/fixtures/jpeg-xl")

const decodeDist = resolve(distDir, "jpegxlwasm_decode.js")
const encodeDist = resolve(distDir, "jpegxlwasm_encode.js")
const skip = !existsSync(decodeDist) || !existsSync(encodeDist)

// The shipped modules are built with -sENVIRONMENT=web,worker, so nothing in
// the glue reads the .wasm off disk; handing it over as wasmBinary is what
// makes them loadable under Node.
async function load(distPath) {
  const factory = (await import(pathToFileURL(distPath).href)).default
  return factory({
    wasmBinary: readFileSync(distPath.replace(/\.js$/, ".wasm")),
    print: () => {},
    printErr: () => {},
  })
}

const read = (name) => (skip ? null : readFileSync(resolve(fixturesDir, name)))

const ctEncoded = read("ct-512x512-s00.jxl")
const ctRaw = read("ct-512x512-s00.raw")
const colorEncoded = read("wsi-2frame-512x512-f00.jxl")

// bitsPerSample is BitsStored, and isSigned is always false: JPEG XL has no
// signed sample type, so dicom-codec level-shifts before it gets here.
const ctFrameInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
  isSigned: false,
}

let decodeCodec
let encodeCodec
let coldDecCT
let coldDecColor
let warmDec
let coldEnc
let warmEnc

if (!skip) {
  decodeCodec = await load(decodeDist)
  encodeCodec = await load(encodeDist)

  coldDecCT = new decodeCodec.JpegXLDecoder()
  coldDecColor = new decodeCodec.JpegXLDecoder()
  coldEnc = new encodeCodec.JpegXLEncoder()

  warmDec = new decodeCodec.JpegXLDecoder()
  for (let i = 0; i < 5; i++) {
    warmDec.getEncodedBuffer(ctEncoded.length).set(ctEncoded)
    warmDec.decode()
  }

  warmEnc = new encodeCodec.JpegXLEncoder()
  for (let i = 0; i < 5; i++) {
    warmEnc.getDecodedBuffer(ctFrameInfo).set(ctRaw)
    warmEnc.setLossless(true)
    warmEnc.encode()
  }
}

describe.skipIf(skip)("libjxl JPEG XL (wasm)", () => {
  // Batched x50 for the same reason as charls: one instantiate+destroy is
  // dominated by fixed harness overhead, so the loop puts the body in the ms
  // range where the codec work is the signal.
  bench("instantiate+destroy JpegXLDecoder x50", () => {
    for (let i = 0; i < 50; i++) {
      const d = new decodeCodec.JpegXLDecoder()
      d.delete()
    }
  })

  bench("instantiate+destroy JpegXLEncoder x50", () => {
    for (let i = 0; i < 50; i++) {
      const e = new encodeCodec.JpegXLEncoder()
      e.delete()
    }
  })

  bench("decode CT 512x512x16bit lossless — cold", () => {
    coldDecCT.getEncodedBuffer(ctEncoded.length).set(ctEncoded)
    coldDecCT.decode()
  })

  bench("decode CT 512x512x16bit lossless — warm", () => {
    warmDec.getEncodedBuffer(ctEncoded.length).set(ctEncoded)
    warmDec.decode()
  })

  bench("decode WSI 512x512 RGB lossless — cold", () => {
    coldDecColor.getEncodedBuffer(colorEncoded.length).set(colorEncoded)
    coldDecColor.decode()
  })

  bench("decode WSI 512x512 RGB lossless — warm", () => {
    warmDec.getEncodedBuffer(colorEncoded.length).set(colorEncoded)
    warmDec.decode()
  })

  bench("encode CT 512x512x16bit lossless — cold", () => {
    coldEnc.getDecodedBuffer(ctFrameInfo).set(ctRaw)
    coldEnc.setLossless(true)
    coldEnc.encode()
  })

  bench("encode CT 512x512x16bit lossless — warm", () => {
    warmEnc.getDecodedBuffer(ctFrameInfo).set(ctRaw)
    warmEnc.setLossless(true)
    warmEnc.encode()
  })

  // Effort 7 (the default) at distance 1.0 is the lossy path dicom-codec's
  // .112 uses; it is a different code path in libjxl from modular lossless,
  // so it gets its own measurement.
  bench("encode CT 512x512x16bit lossy d=1.0 — warm", () => {
    warmEnc.getDecodedBuffer(ctFrameInfo).set(ctRaw)
    warmEnc.setLossless(false)
    warmEnc.setDistance(1.0)
    warmEnc.encode()
  })
})
