// Decoder/encoder construction is hoisted to module scope so the bench
// body only measures the decode/encode kernel itself. Each fixture gets
// its own pre-constructed instance because the underlying wasm
// J2KDecoder advances internal state on decode() and can't be reused
// across multiple bench bodies. A separate "instantiate+destroy" bench
// measures the lifecycle cost that the old monolithic bench was
// conflating with kernel time — the openjpeg encode CT1.RAW bench had
// the worst variance in the suite (110% spread across 3 runs) and this
// split is the fix.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "openjpegwasm.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2k/CT1.j2k")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2k/CT2.j2k")) : null
const ct1Raw = !skip ? readFileSync(resolve(fixturesDir, "raw/CT1.RAW")) : null
const ctLossy = !skip
  ? readFileSync(resolve(fixturesDir, "j2k/CT-512x512-lossy.j2k"))
  : null

let codec
let decCT1
let decCT2
let decLossy
let encCT1
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decCT1 = new codec.J2KDecoder()
  decCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)

  decCT2 = new codec.J2KDecoder()
  decCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)

  decLossy = new codec.J2KDecoder()
  decLossy.getEncodedBuffer(ctLossy.length).set(ctLossy)

  encCT1 = new codec.J2KEncoder()
  encCT1
    .getDecodedBuffer({
      width: 512,
      height: 512,
      bitsPerSample: 16,
      componentCount: 1,
      isSigned: true,
    })
    .set(ct1Raw)
}

describe.skipIf(skip)("openjpeg J2K (wasm)", () => {
  bench("instantiate+destroy J2KDecoder", () => {
    const d = new codec.J2KDecoder()
    d.delete()
  })

  bench("instantiate+destroy J2KEncoder", () => {
    const e = new codec.J2KEncoder()
    e.delete()
  })

  bench("decode CT1.j2k (.90 lossless 5-3, 512x512x16bit) — kernel", () => {
    decCT1.decode()
  })

  bench("decode CT2.j2k (.90 lossless 5-3, 512x512x16bit) — kernel", () => {
    decCT2.decode()
  })

  bench("decode CT-512x512-lossy.j2k (.91 irreversible 9-7) — kernel", () => {
    decLossy.decode()
  })

  bench("encode CT1.RAW (lossless) — kernel", () => {
    encCT1.encode()
  })
})
