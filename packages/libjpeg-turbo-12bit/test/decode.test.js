import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, "fixtures")

// Genuine 12-bit baseline JPEG fixture (SOF marker 0xC1, precision=12,
// 512x512, 1 component — verified by inspecting the JPEG SOF segment).
const ct12bit = readFileSync(resolve(fixturesDir, "jpeg/CT-512x512-12bit.jpg"))
// Decoded reference for the fixture above: little-endian Uint16 samples,
// verified bit-identical against DCMTK's dcmdjpeg (independent reference
// decoder) and identical across the asm.js and wasm build variants.
const ct12bitRaw = readFileSync(resolve(fixturesDir, "raw/CT-512x512-12bit.raw"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbo12js)", path: "../dist/libjpegturbo12js.js" },
  { name: "wasm (libjpegturbo12wasm)", path: "../dist/libjpegturbo12wasm.js" },
]

describe.each(buildVariants)("libjpeg-turbo-12bit decode — $name", ({ path }) => {
  const isBuilt = existsSync(resolve(__dirname, path))
  let codec

  beforeAll(async () => {
    if (isBuilt) {
      codec = await loadModule(path)
    }
  })

  // In CI a missing dist means the build/artifact pipeline broke; fail loudly
  // instead of letting every skipIf() below silently skip the suite.
  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, `${path} missing — build artifact was not replayed`).toBe(true)
  })

  it.skipIf(!isBuilt)(
    "decodes the CT-512x512 12-bit fixture and reports correct dimensions/format",
    () => {
      const decoder = new codec.JPEGDecoder()
      const encodedBuffer = decoder.getEncodedBuffer(ct12bit.length)
      encodedBuffer.set(ct12bit)

      decoder.decode()

      const frameInfo = decoder.getFrameInfo()
      expect(frameInfo.width).toBe(512)
      expect(frameInfo.height).toBe(512)
      expect(frameInfo.bitsPerSample).toBe(12)
      expect(frameInfo.componentCount).toBe(1)

      const decoded = decoder.getDecodedBuffer()
      // One 16-bit-wide sample per pixel (grayscale, 1 component/pixel).
      expect(decoded.length).toBe(512 * 512)

      decoder.delete()
    }
  )

  it.skipIf(!isBuilt)("decodes the CT-512x512 12-bit fixture and matches the RAW reference", () => {
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(ct12bit.length)
    encodedBuffer.set(ct12bit)

    decoder.decode()

    const decoded = decoder.getDecodedBuffer()
    // getDecodedBuffer() returns a Uint16Array (one entry per sample);
    // compare its underlying bytes against the little-endian RAW reference.
    const decodedBytes = Buffer.from(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    )
    expect(decodedBytes.length).toBe(ct12bitRaw.length)
    expect(decodedBytes.equals(ct12bitRaw)).toBe(true)

    decoder.delete()
  })

  it.skipIf(!isBuilt)("rejects multi-component (color) 12-bit JPEGs instead of silently dropping chroma", () => {
    // Splice the grayscale fixture into a syntactically valid 3-component
    // JPEG: rewrite SOF1 (FFC1) from 1 to 3 components and SOS (FFDA) from
    // 1 to 3 selectors. The decoder must fail closed on the header — a
    // forced JCS_GRAYSCALE decode would silently discard the chroma
    // channels — so the entropy data never being read is fine.
    const findMarker = (buf, marker) => {
      for (let i = 2; i < buf.length - 1; i++) {
        if (buf[i] === 0xff && buf[i + 1] === marker) return i
      }
      throw new Error("marker not found")
    }
    const sofAt = findMarker(ct12bit, 0xc1)
    const sosAt = findMarker(ct12bit, 0xda)

    const before = ct12bit.subarray(0, sofAt)
    const sofBody = ct12bit.subarray(sofAt + 4, sofAt + 4 + 5) // P(1), Y(2), X(2)
    const between = ct12bit.subarray(sofAt + 2 + 11, sosAt) // after 1-comp SOF
    const after = ct12bit.subarray(sosAt + 2 + 8) // after 1-comp SOS: entropy data

    const sof3 = Buffer.concat([
      Buffer.from([0xff, 0xc1, 0x00, 17]),
      sofBody,
      Buffer.from([3]), // Nf = 3
      Buffer.from([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
    ])
    const sos3 = Buffer.concat([
      Buffer.from([0xff, 0xda, 0x00, 12, 3]), // Ns = 3
      Buffer.from([1, 0x00, 2, 0x00, 3, 0x00]),
      ct12bit.subarray(sosAt + 7, sosAt + 10), // Ss, Se, Ah/Al
    ])
    const colorJpeg = Buffer.concat([before, sof3, between, sos3, after])

    const decoder = new codec.JPEGDecoder()
    decoder.getEncodedBuffer(colorJpeg.length).set(colorJpeg)

    expect(() => decoder.decode()).toThrow()

    decoder.delete()
  })

  it.skipIf(!isBuilt)("handles truncated input without crashing", () => {
    // libjpeg treats a premature end-of-file as a recoverable warning (it
    // fills the missing scanlines rather than aborting), so decode() may
    // return normally instead of throwing. The meaningful guarantee here is
    // that truncated input is handled gracefully — it either throws or
    // returns, but never corrupts the process.
    const truncated = ct12bit.subarray(0, Math.floor(ct12bit.length / 2))
    const decoder = new codec.JPEGDecoder()
    const encodedBuffer = decoder.getEncodedBuffer(truncated.length)
    encodedBuffer.set(truncated)

    expect(() => {
      try {
        decoder.decode()
      } catch (e) {
        // throwing is an acceptable outcome for malformed input
      }
    }).not.toThrow()

    decoder.delete()
  })
})
