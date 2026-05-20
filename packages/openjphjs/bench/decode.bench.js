// Decoder/encoder construction is hoisted to module scope so the bench
// body only measures the decode/encode kernel itself. A separate
// "instantiate+destroy" bench measures the lifecycle cost that the old
// monolithic bench was conflating with kernel time.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "openjphjs.js")
const skip = !existsSync(distPath)

const ct1Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2c/CT1.j2c")) : null
const ct2Encoded = !skip ? readFileSync(resolve(fixturesDir, "j2c/CT2.j2c")) : null
const ct1Raw = !skip ? readFileSync(resolve(fixturesDir, "raw/CT1.RAW")) : null

let codec
let decCT1
let decCT2
let encCT1
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  decCT1 = new codec.HTJ2KDecoder()
  decCT1.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)

  decCT2 = new codec.HTJ2KDecoder()
  decCT2.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)

  encCT1 = new codec.HTJ2KEncoder()
  encCT1
    .getDecodedBuffer({
      width: 512,
      height: 512,
      bitsPerSample: 16,
      componentCount: 1,
      isSigned: true,
      isUsingColorTransform: false,
    })
    .set(ct1Raw)
}

describe.skipIf(skip)("openjphjs HTJ2K (wasm)", () => {
  bench("instantiate+destroy HTJ2KDecoder", () => {
    const d = new codec.HTJ2KDecoder()
    d.delete()
  })

  bench("instantiate+destroy HTJ2KEncoder", () => {
    const e = new codec.HTJ2KEncoder()
    e.delete()
  })

  bench("decode CT1.j2c (.201 lossless, 512x512x16bit) — kernel", () => {
    decCT1.decode()
  })

  bench("decode CT2.j2c (.201 lossless, 512x512x16bit) — kernel", () => {
    decCT2.decode()
  })

  bench("encode CT1.RAW (HTJ2K lossless) — kernel", () => {
    encCT1.encode()
  })
})
