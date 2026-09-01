// Package-level smoke test: the two shipped modules load and round-trip.
//
// Codec behaviour through the DICOM dispatcher — transfer syntaxes, signed
// sample handling, the committed fixtures — is covered by
// packages/dicom-codec/test/jpegxl-fixtures.test.js. What is checked here is
// the contract that suite and bench/decode.bench.js both depend on and
// neither states: that dist/ loads under Node at all, and that the embind
// surface is the one the wrappers call.

import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")

const decodeDist = resolve(distDir, "jpegxlwasm_decode.js")
const encodeDist = resolve(distDir, "jpegxlwasm_encode.js")
const BUILT = existsSync(decodeDist) && existsSync(encodeDist)

// The modules are built with -sENVIRONMENT=web,worker: nothing in the glue
// reads the .wasm off disk, so wasmBinary is what makes them load under Node.
// If that ever stops being true the whole JPEG XL test and bench story goes
// with it, which is why it is asserted here rather than assumed.
async function load(distPath) {
  const factory = (await import(pathToFileURL(distPath).href)).default
  return factory({
    wasmBinary: readFileSync(distPath.replace(/\.js$/, ".wasm")),
    print: () => {},
    printErr: () => {},
  })
}

it.runIf(process.env.CI)("dist is present in CI", () => {
  expect(BUILT, "libjxl dist missing — build did not run").toBe(true)
})

describe.skipIf(!BUILT)("libjxl wasm modules", () => {
  let decodeCodec
  let encodeCodec

  beforeAll(async () => {
    decodeCodec = await load(decodeDist)
    encodeCodec = await load(encodeDist)
  })

  it("exposes JpegXLDecoder and JpegXLEncoder", () => {
    expect(typeof decodeCodec.JpegXLDecoder).toBe("function")
    expect(typeof encodeCodec.JpegXLEncoder).toBe("function")
    // The decode module is decode-only on purpose: it links jxl_dec, not jxl,
    // which is what keeps it at ~1 MB against the encoder's ~2.5 MB.
    expect(decodeCodec.JpegXLEncoder).toBeUndefined()
  })

  it.each([
    { label: "16-bit greyscale", bitsPerSample: 16, componentCount: 1 },
    { label: "8-bit RGB", bitsPerSample: 8, componentCount: 3 },
  ])("round-trips $label losslessly", ({ bitsPerSample, componentCount }) => {
    const width = 64
    const height = 48
    const bytesPerSample = bitsPerSample <= 8 ? 1 : 2
    const frameInfo = { width, height, bitsPerSample, componentCount, isSigned: false }

    // A gradient plus a hard edge: compressible, but not so uniform that a
    // broken decode would still match.
    const source = new Uint8Array(width * height * componentCount * bytesPerSample)
    for (let i = 0; i < source.length; i++) {
      source[i] = (i * 7 + (i % 13 === 0 ? 128 : 0)) & 0xff
    }

    const encoder = new encodeCodec.JpegXLEncoder()
    encoder.getDecodedBuffer(frameInfo).set(source)
    encoder.setLossless(true)
    encoder.encode()
    const bitstream = new Uint8Array(encoder.getEncodedBuffer())
    encoder.delete()

    expect(bitstream.length).toBeGreaterThan(0)

    const decoder = new decodeCodec.JpegXLDecoder()
    decoder.getEncodedBuffer(bitstream.length).set(bitstream)
    decoder.decode()
    const decoded = new Uint8Array(decoder.getDecodedBuffer())
    const info = decoder.getFrameInfo()

    expect(info.width).toBe(width)
    expect(info.height).toBe(height)
    expect(info.bitsPerSample).toBe(bitsPerSample)
    expect(info.componentCount).toBe(componentCount)
    // JPEG XL cannot represent signedness; the decoder always says so.
    expect(info.isSigned).toBe(false)
    expect(Buffer.from(decoded).equals(Buffer.from(source))).toBe(true)

    decoder.delete()
  })

  it("rejects signed frame info rather than encoding it wrongly", () => {
    const encoder = new encodeCodec.JpegXLEncoder()
    expect(() =>
      encoder.getDecodedBuffer({
        width: 8,
        height: 8,
        bitsPerSample: 16,
        componentCount: 1,
        isSigned: true,
      })
    ).toThrow()
    encoder.delete()
  })

  it("throws on a bitstream that is not JPEG XL", () => {
    const decoder = new decodeCodec.JpegXLDecoder()
    const garbage = new Uint8Array(64).fill(0x5a)
    decoder.getEncodedBuffer(garbage.length).set(garbage)
    expect(() => decoder.decode()).toThrow()
    decoder.delete()
  })
})
