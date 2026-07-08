import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { gray8FromCT2, gray12FromCT2 } from "../../../tools/fixture-verification/gen/derive.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "openjphjs.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

const asBuffer = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)

// Color and bit-depth coverage beyond the 16-bit CT corpus.
//
// Fixture provenance (tools/fixture-verification/gen/generate-fixtures.mjs):
// all four are lossless HTJ2K encodes of committed sources (US1.RAW RGB
// frame; deterministic CT2.RAW transforms from derive.mjs), so each test's
// reference is re-derived from the source — a decoder OR encoder regression
// on these paths breaks byte equality.
//
// The color pair covers both isUsingColorTransform settings — the RCT path
// was flagged "not been tested yet" in HTJ2KDecoder.hpp.
describe("openjphjs HTJ2K decode matrix — color and bit depths", () => {
  let codec
  const us1 = readFileSync(resolve(__dirname, "../../openjpeg/test/fixtures/raw/US1.RAW"))
  const ct2 = readFileSync(resolve(__dirname, "../../charls/test/fixtures/CT2.RAW"))

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjphjs.js")
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, "openjphjs.js missing — build artifact was not replayed").toBe(true)
  })

  const decode = (file) => {
    const encoded = readFileSync(resolve(fixturesDir, "j2c", file))
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const frameInfo = decoder.getFrameInfo()
    const out = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()
    return { frameInfo, out }
  }

  it.skipIf(!isBuilt)("decodes 3-component color losslessly (no color transform)", () => {
    const { frameInfo, out } = decode("US1-color-nct.j2c")
    expect(frameInfo.componentCount).toBe(3)
    expect(frameInfo.bitsPerSample).toBe(8)
    expect(out.equals(us1)).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes 3-component color losslessly (reversible color transform)", () => {
    const { frameInfo, out } = decode("US1-color-ct.j2c")
    expect(frameInfo.componentCount).toBe(3)
    expect(out.equals(us1)).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes 8-bit grayscale losslessly", () => {
    const { frameInfo, out } = decode("CT2-gray8.j2c")
    expect(frameInfo.bitsPerSample).toBe(8)
    expect(out.equals(asBuffer(gray8FromCT2(ct2)))).toBe(true)
  })

  it.skipIf(!isBuilt)("decodes 12-bit grayscale losslessly", () => {
    const { frameInfo, out } = decode("CT2-gray12.j2c")
    expect(frameInfo.bitsPerSample).toBe(12)
    expect(out.equals(asBuffer(gray12FromCT2(ct2)))).toBe(true)
  })
})
