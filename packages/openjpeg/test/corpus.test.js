import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "openjpegwasm.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

// Every shipped .j2k fixture with a committed RAW reference, previously
// unused by any test. Verified byte-exact on activation (2026-07-07); the
// RAWs are the references these lossless codestreams were produced from.
// Together they pin the decoder across bit depths (8/10/12/15/16),
// signedness, dimensions, and — for US1/VL* — 3-component color, which no
// other openjpeg test touches. Variant agreement (asm.js/wasm/decode-only)
// is covered for CT1/CT2 in decode.test.js; this corpus runs on the wasm
// variant to keep runtime sane.
const corpus = [
  { file: "MG1.j2k", width: 3064, height: 4664, bps: 12, comp: 1, signed: false },
  { file: "MR1.j2k", width: 512, height: 512, bps: 16, comp: 1, signed: true },
  { file: "MR2.j2k", width: 1024, height: 1024, bps: 12, comp: 1, signed: false },
  { file: "MR3.j2k", width: 512, height: 512, bps: 16, comp: 1, signed: true },
  { file: "MR4.j2k", width: 512, height: 512, bps: 12, comp: 1, signed: false },
  { file: "NM1.j2k", width: 256, height: 1024, bps: 16, comp: 1, signed: true },
  { file: "RG1.j2k", width: 1841, height: 1955, bps: 15, comp: 1, signed: false },
  { file: "RG2.j2k", width: 1760, height: 2140, bps: 10, comp: 1, signed: false },
  { file: "RG3.j2k", width: 1760, height: 1760, bps: 10, comp: 1, signed: false },
  { file: "SC1.j2k", width: 2048, height: 2487, bps: 12, comp: 1, signed: false },
  { file: "XA1.j2k", width: 1024, height: 1024, bps: 10, comp: 1, signed: false },
  { file: "US1.j2k", width: 640, height: 480, bps: 8, comp: 3, signed: false },
  { file: "VL1.j2k", width: 756, height: 486, bps: 8, comp: 3, signed: false },
  { file: "VL4.j2k", width: 2226, height: 1868, bps: 8, comp: 3, signed: false },
  { file: "VL6.j2k", width: 756, height: 486, bps: 8, comp: 3, signed: false },
]

describe("openjpeg J2K decode corpus (bit depths, signedness, color)", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjpegwasm.js")
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, "openjpegwasm.js missing — build artifact was not replayed").toBe(true)
  })

  it.skipIf(!isBuilt).each(corpus)(
    "decodes $file ($width x $height, $bps-bit, $comp comp) byte-exact vs RAW",
    ({ file, width, height, bps, comp, signed }) => {
      const encoded = readFileSync(resolve(fixturesDir, "j2k", file))
      const raw = readFileSync(resolve(fixturesDir, "raw", file.replace(".j2k", ".RAW")))

      const decoder = new codec.J2KDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(width)
      expect(frameInfo.height).toBe(height)
      expect(frameInfo.bitsPerSample).toBe(bps)
      expect(frameInfo.componentCount).toBe(comp)
      expect(frameInfo.isSigned).toBe(signed)

      const decoded = decoder.getDecodedBuffer()
      expect(decoded.length).toBe(raw.length)
      expect(Buffer.from(decoded).equals(raw)).toBe(true)

      decoder.delete()
    }
  )

  it.skipIf(!isBuilt)("decodes the 0-decomposition CT1 variant to the same pixels as CT1", () => {
    const encoded = readFileSync(resolve(fixturesDir, "j2k/CT1-0decomp.j2k"))
    const raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    expect(Buffer.from(decoder.getDecodedBuffer()).equals(raw)).toBe(true)
    decoder.delete()
  })
})
