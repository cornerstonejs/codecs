import { beforeAll, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

// 12-bit JPEG (DICOM transfer syntax 1.2.840.10008.1.2.4.51) uses 12 bits per
// sample stored in a 16-bit word. There is no real 12-bit fixture in the repo
// (jpeg400jfif.jpg is 8-bit and is rejected by this decoder with
// "Unsupported JPEG data precision 8"), so each variant is exercised via a
// synthetic encode-then-decode round-trip with a generated gradient.

const buildVariants = [
  { name: "asm.js (libjpegturbo12js)", path: "../dist/libjpegturbo12js.js", dist: "libjpegturbo12js.js" },
  { name: "wasm (libjpegturbo12wasm)", path: "../dist/libjpegturbo12wasm.js", dist: "libjpegturbo12wasm.js" },
]

function makeSynthetic12BitFrame(width, height) {
  // 12-bit samples (values 0–4095) stored little-endian in 16-bit words.
  const raw = new Uint8Array(width * height * 2)
  const total = width * height
  for (let i = 0; i < total; i++) {
    const v = Math.floor((i / total) * 4095) & 0x0fff
    raw[i * 2] = v & 0xff
    raw[i * 2 + 1] = (v >> 8) & 0xff
  }
  return raw
}

describe.each(buildVariants)(
  "libjpeg-turbo-12bit round-trip — $name",
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)(
      "encodes 12-bit raw → JPEG and decodes back to matching dimensions",
      () => {
        const width = 256
        const height = 256
        const raw = makeSynthetic12BitFrame(width, height)

        const encoder = new codec.JPEGEncoder()
        encoder
          .getDecodedBuffer({
            width,
            height,
            bitsPerSample: 12,
            componentCount: 1,
            isSigned: false,
          })
          .set(raw)
        encoder.encode()
        const encoded = encoder.getEncodedBuffer()
        expect(encoded.length).toBeGreaterThan(0)

        const decoder = new codec.JPEGDecoder()
        decoder.getEncodedBuffer(encoded.length).set(encoded)
        decoder.decode()

        const frameInfo = decoder.getFrameInfo()
        expect(frameInfo.width).toBe(width)
        expect(frameInfo.height).toBe(height)
        expect(frameInfo.componentCount).toBe(1)

        const decoded = decoder.getDecodedBuffer()
        expect(decoded.length).toBe(width * height * 2)

        encoder.delete()
        decoder.delete()
      }
    )

    it.skipIf(!isBuilt)("throws on truncated input", () => {
      const width = 128
      const height = 128
      const raw = makeSynthetic12BitFrame(width, height)
      const encoder = new codec.JPEGEncoder()
      encoder
        .getDecodedBuffer({
          width,
          height,
          bitsPerSample: 12,
          componentCount: 1,
          isSigned: false,
        })
        .set(raw)
      encoder.encode()
      const encoded = encoder.getEncodedBuffer()
      const truncated = encoded.slice(0, Math.floor(encoded.length / 2))

      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(truncated.length).set(truncated)

      expect(() => decoder.decode()).toThrow()

      encoder.delete()
      decoder.delete()
    })
  }
)
