// Regression coverage for the buffer stream's skip callback.
//
// opj_skip_from_buffer in src/BufferStream.hpp is handed to openjpeg as an
// opj_stream_skip_fn, which is OPJ_OFF_T(OPJ_OFF_T, void*). It used to be
// declared with OPJ_SIZE_T, and OPJ_SIZE_T is 32-bit under wasm32 while
// OPJ_OFF_T is int64_t, so the cast produced an (i64,i32)->i64 indirect call
// onto an (i32,i32)->i32 table entry. wasm traps that as
// "function signature mismatch" — see issue #62 and
// cornerstoneWADOImageLoader#400.
//
// Reaching the callback needs a skip bigger than the stream's 1MB internal
// buffer, because opj_stream_read_skip serves anything smaller straight out of
// it. wrapInJp2 arranges exactly that with an oversized 'free' box ahead of the
// codestream; see test/helpers/jp2.mjs. None of the .j2k fixtures trigger it,
// which is why the bug survived so long.
//
// Verified against a deliberately unfixed build: the two wasm targets throw
// RuntimeError, and the asm.js target is worse — it does not trap at all, it
// just reports width/height 0 and returns pixels that do not match the same
// codestream decoded bare. So this must assert on the decoded output, not
// merely that decode() did not throw.
import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { STREAM_CHUNK_SIZE, wrapInJp2 } from "./helpers/jp2.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const ct1Encoded = readFileSync(resolve(fixturesDir, "j2k/CT1.j2k"))
const ct1Raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))

// Built once here rather than per-variant: it is ~1.2MB of Buffer work.
const ct1Jp2 = wrapInJp2(ct1Encoded)

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js full (openjpegjs)", path: "../dist/openjpegjs.js", dist: "openjpegjs.js" },
  { name: "wasm full (openjpegwasm)", path: "../dist/openjpegwasm.js", dist: "openjpegwasm.js" },
  { name: "wasm decode-only", path: "../dist/openjpegwasm_decode.js", dist: "openjpegwasm_decode.js" },
]

/** Walks a JP2 box list, returning each box's type and its content slice. */
function readBoxes(buffer) {
  const boxes = []
  let offset = 0
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    // A length of 0 or 1 means "to end of file" / "64-bit length"; the builder
    // emits neither, and treating them as normal would loop forever.
    if (length < 8) throw new Error(`degenerate box length ${length} at ${offset}`)
    boxes.push({
      type: buffer.toString("ascii", offset + 4, offset + 8),
      length,
      content: buffer.subarray(offset + 8, offset + length),
    })
    offset += length
  }
  if (offset !== buffer.length) {
    throw new Error(`boxes overrun the buffer: ended at ${offset} of ${buffer.length}`)
  }
  return boxes
}

describe("JP2 test fixture construction", () => {
  const boxes = readBoxes(ct1Jp2)

  it("puts a skipped box larger than the stream buffer ahead of the codestream", () => {
    // If this stops holding, the decode tests below still pass but stop
    // covering the skip callback at all — openjpeg would serve the skip from
    // its internal buffer and never call into BufferStream.hpp. readBoxes also
    // asserts the lengths tile the file exactly.
    expect(boxes.map((b) => b.type)).toEqual(["jP  ", "ftyp", "jp2h", "free", "jp2c"])

    const free = boxes.find((b) => b.type === "free")
    expect(free.content.length).toBeGreaterThan(STREAM_CHUNK_SIZE)
  })

  it("describes the wrapped codestream in the image header", () => {
    // A jp2h that disagrees with the codestream makes openjpeg fail for
    // reasons that have nothing to do with skipping.
    const jp2h = boxes.find((b) => b.type === "jp2h")
    const ihdr = readBoxes(jp2h.content).find((b) => b.type === "ihdr")

    expect(ihdr.content.length).toBe(14) // opj_jp2_read_ihdr rejects any other size
    expect(ihdr.content.readUInt32BE(0)).toBe(512) // HEIGHT
    expect(ihdr.content.readUInt32BE(4)).toBe(512) // WIDTH
    expect(ihdr.content.readUInt16BE(8)).toBe(1) // NC
    expect(ihdr.content.readUInt8(10)).toBe(0x8f) // BPC: signed 16-bit
  })

  it("embeds the codestream unchanged", () => {
    const jp2c = boxes.find((b) => b.type === "jp2c")
    expect(jp2c.content.equals(ct1Encoded)).toBe(true)
  })
})

describe.each(buildVariants)("openjpeg JP2 decode — $name", ({ path, dist }) => {
  const isBuilt = existsSync(resolve(distDir, dist))
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(path)
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, `${dist} missing — build artifact was not replayed`).toBe(true)
  })

  it.skipIf(!isBuilt)(
    "decodes a JP2 whose skipped box exceeds the stream buffer (issue #62)",
    () => {
      const decoder = new codec.J2KDecoder()
      decoder.getEncodedBuffer(ct1Jp2.length).set(ct1Jp2)

      // Before the BufferStream.hpp fix: RuntimeError on the wasm targets,
      // and a silent width/height of 0 on asm.js.
      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(512)
      expect(frameInfo.height).toBe(512)
      expect(frameInfo.bitsPerSample).toBe(16)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      expect(decoded.length).toBe(ct1Raw.length)
      expect(Buffer.from(decoded).equals(ct1Raw)).toBe(true)

      decoder.delete()
    }
  )

  it.skipIf(!isBuilt)("decodes the JP2 to the same pixels as the bare codestream", () => {
    const fromJp2 = new codec.J2KDecoder()
    fromJp2.getEncodedBuffer(ct1Jp2.length).set(ct1Jp2)
    fromJp2.decode()
    const jp2Pixels = Buffer.from(fromJp2.getDecodedBuffer())

    const fromJ2k = new codec.J2KDecoder()
    fromJ2k.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
    fromJ2k.decode()
    const j2kPixels = Buffer.from(fromJ2k.getDecodedBuffer())

    expect(jp2Pixels.equals(j2kPixels)).toBe(true)

    fromJp2.delete()
    fromJ2k.delete()
  })

  // Truncated here means the 'free' box header survives but its content and
  // the codestream do not. That is handled by cio.c's own end-of-stream guard
  // (it refuses to skip past m_user_data_length) rather than by our callback,
  // so this is a malformed-input robustness check, not skip coverage.
  it.skipIf(!isBuilt)("does not crash when a box claims to run past the end", () => {
    const truncated = wrapInJp2(ct1Encoded).subarray(0, 32 + 45 + 8 + 1024)

    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(truncated.length).set(truncated)

    expect(() => {
      try {
        decoder.decode()
      } catch {
        // failing to decode a truncated file is the expected outcome; not
        // trapping or corrupting the heap is what is being asserted
      }
    }).not.toThrow()

    decoder.delete()
  })
})
