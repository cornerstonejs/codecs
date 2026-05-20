// Decoder/encoder construction is hoisted to module scope so the bench
// body only measures the decode/encode kernel itself. Each fixture gets
// its own pre-constructed instance because the underlying wasm
// JpegLSDecoder advances internal state on decode() and can't be reused
// across multiple bench bodies. A separate "instantiate+destroy" bench
// measures the lifecycle cost that the old monolithic bench was
// conflating with kernel time.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "charlswasm.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT1.JLS")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "CT2.JLS")) : null
const ct2Raw = !skip ? readFileSync(resolve(fixturesDir, "CT2.RAW")) : null
const ctNearLossless = !skip
  ? readFileSync(resolve(fixturesDir, "CT-512x512-near-lossless.JLS"))
  : null

let codec
let decCT1
let decCT2
let decNL
let encCT2
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decCT1 = new codec.JpegLSDecoder()
  decCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)

  decCT2 = new codec.JpegLSDecoder()
  decCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)

  decNL = new codec.JpegLSDecoder()
  decNL.getEncodedBuffer(ctNearLossless.length).set(ctNearLossless)

  encCT2 = new codec.JpegLSEncoder()
  encCT2
    .getDecodedBuffer({
      width: 512,
      height: 512,
      bitsPerSample: 16,
      componentCount: 1,
    })
    .set(ct2Raw)
  encCT2.setNearLossless(0)
}

describe.skipIf(skip)("charls JPEG-LS (wasm)", () => {
  bench("instantiate+destroy JpegLSDecoder", () => {
    const d = new codec.JpegLSDecoder()
    d.delete()
  })

  bench("instantiate+destroy JpegLSEncoder", () => {
    const e = new codec.JpegLSEncoder()
    e.delete()
  })

  bench("decode CT1.JLS (.80 lossless, 512x512x16bit) — kernel", () => {
    decCT1.decode()
  })

  bench("decode CT2.JLS (.80 lossless, 512x512x16bit) — kernel", () => {
    decCT2.decode()
  })

  bench("decode CT-512x512-near-lossless.JLS (.81 near-lossless) — kernel", () => {
    decNL.decode()
  })

  bench("encode CT2.RAW (lossless near=0) — kernel", () => {
    encCT2.encode()
  })
})
