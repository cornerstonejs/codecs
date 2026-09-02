import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { gray8FromCT2, gray12FromCT2, bilevelFromCT2 } from "../../../tools/fixture-verification/gen/derive.mjs"

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
// was flagged "not been tested yet" in HTJ2KDecoder.hpp. The 12-bit case
// pins the row-stride fix in HTJ2KEncoder.hpp (bitsPerSample/8 truncated to
// 1 for 9..15-bit samples, corrupting every row after the first).
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

  it.skipIf(!isBuilt)("decodes 12-bit grayscale losslessly (encoder stride regression case)", () => {
    const { frameInfo, out } = decode("CT2-gray12.j2c")
    expect(frameInfo.bitsPerSample).toBe(12)
    expect(out.equals(asBuffer(gray12FromCT2(ct2)))).toBe(true)
  })

  it.skipIf(!isBuilt)("round-trips 12-bit through the encoder (pins the stride fix)", () => {
    // Re-encode the 12-bit source in-process: proves the ENCODER writes
    // every row from the right offset, independent of the committed fixture.
    const src = gray12FromCT2(ct2)
    const encoder = new codec.HTJ2KEncoder()
    encoder
      .getDecodedBuffer({ width: 512, height: 512, bitsPerSample: 12, componentCount: 1, isSigned: false, isUsingColorTransform: false })
      .set(new Uint8Array(src.buffer, 0, src.byteLength))
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const out = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()

    expect(out.equals(asBuffer(src))).toBe(true)
  })

  // 1 bit is the other end of the same stride fix, and the end that was fully
  // broken rather than partly: bitsPerSample / 8 is 0 for a 1-bit sample, so
  // the encode loop read every row from offset 0 and the codestream held row 0
  // repeated `height` times. getDecodedBuffer already used the round-up form,
  // so the buffer the caller filled was the right size all along — only the
  // reader of it disagreed. Both the round-trip below and the row-0 assertion
  // fail against the old expression.
  it.skipIf(!isBuilt)("round-trips 1-bit through the encoder (pins the stride fix at 1 bit)", () => {
    const src = bilevelFromCT2(ct2)
    const encoder = new codec.HTJ2KEncoder()
    const frameInfo = { width: 512, height: 512, bitsPerSample: 1, componentCount: 1, isSigned: false, isUsingColorTransform: false }
    const input = encoder.getDecodedBuffer(frameInfo)
    // One byte per sample: (1 + 7) / 8 == 1, the same as 8-bit.
    expect(input.length).toBe(512 * 512)
    input.set(src)
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const decoded = decoder.getFrameInfo()
    const out = Buffer.from(decoder.getDecodedBuffer())
    expect(decoder.getLastErrorMessage()).toBe("")
    decoder.delete()

    expect(decoded.bitsPerSample).toBe(1)
    expect(decoded.width).toBe(512)
    expect(decoded.height).toBe(512)
    expect(out.length).toBe(512 * 512)
    expect(out.equals(asBuffer(src))).toBe(true)

    // Named the failure mode explicitly, so a regression reads as "rows
    // collapsed" rather than a bare buffer mismatch. Row 0 of a CT slice is
    // background and so are the rows next to it, so compare against a row
    // through the anatomy; assert the source rows really do differ rather than
    // trusting the derivation.
    const row = (buf, y) => buf.subarray(y * 512, (y + 1) * 512)
    expect(row(asBuffer(src), 256).equals(row(asBuffer(src), 0))).toBe(false)
    expect(row(out, 256).equals(row(out, 0))).toBe(false)
  })

  // Sub-byte depths other than 1 take the same <= 8 branch, and 2..7 all
  // truncated to a stride of 0 the same way. 4-bit is the cheap check that the
  // fix is the whole round-up and not a 1-bit special case.
  it.skipIf(!isBuilt)("round-trips 4-bit through the encoder", () => {
    const gray8 = gray8FromCT2(ct2)
    const src = new Uint8Array(gray8.length)
    for (let i = 0; i < gray8.length; i++) src[i] = gray8[i] >> 4
    const encoder = new codec.HTJ2KEncoder()
    encoder
      .getDecodedBuffer({ width: 512, height: 512, bitsPerSample: 4, componentCount: 1, isSigned: false, isUsingColorTransform: false })
      .set(src)
    encoder.encode()
    const encoded = Buffer.from(encoder.getEncodedBuffer())
    encoder.delete()

    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    const out = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()

    expect(out.equals(asBuffer(src))).toBe(true)
  })
})
