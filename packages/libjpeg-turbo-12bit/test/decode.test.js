import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

// CT-512x512-12bit.jpg is a real 12-bit JPEG extracted from a DICOM file with
// transfer syntax 1.2.840.10008.1.2.4.51 (JPEG Extended, Process 2 & 4). It's
// the only fixture the 12-bit decoder will accept — the older
// jpeg400jfif.jpg in the same dir is 8-bit and is rejected with
// "Unsupported JPEG data precision 8".
const ct12bit = readFileSync(resolve(fixturesDir, "jpeg/CT-512x512-12bit.jpg"))
const jpeg8bit = readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const buildVariants = [
  { name: "asm.js (libjpegturbo12js)", path: "../dist/libjpegturbo12js.js", dist: "libjpegturbo12js.js" },
  { name: "wasm (libjpegturbo12wasm)", path: "../dist/libjpegturbo12wasm.js", dist: "libjpegturbo12wasm.js" },
]

describe.each(buildVariants)(
  "libjpeg-turbo-12bit decoder — $name",
  ({ path, dist }) => {
    const isBuilt = existsSync(resolve(distDir, dist))
    let codec

    beforeAll(async () => {
      if (isBuilt) codec = await loadModule(path)
    })

    it.skipIf(!isBuilt)(
      "decodes the 12-bit CT JPEG to a 512x512 16-bit-allocated frame",
      () => {
        const decoder = new codec.JPEGDecoder()
        decoder.getEncodedBuffer(ct12bit.length).set(ct12bit)
        decoder.decode()

        const frameInfo = decoder.getFrameInfo()
        expect(frameInfo.width).toBe(512)
        expect(frameInfo.height).toBe(512)
        expect(frameInfo.componentCount).toBe(1)
        // NOTE: the wasm FrameInfo.bitsPerSample field reports bytes per
        // sample for 12-bit input (reports 8 for 12-bit JPEG), not the
        // JPEG's precision marker. Don't assert it; rely on byteLength
        // instead.

        const decoded = decoder.getDecodedBuffer()
        // 512*512 samples × 16 bits allocated = 524,288 bytes
        expect(decoded.length).toBe(512 * 512 * 2)

        // Sanity-check pixel value range matches what we expect from a
        // 12-bit CT (uncalibrated; 0..4095). View as Uint16 LE.
        const view = new Uint16Array(decoded.buffer, decoded.byteOffset, decoded.length / 2)
        let max = view[0]
        for (let i = 1; i < view.length; i++) {
          if (view[i] > max) max = view[i]
        }
        expect(max).toBeGreaterThan(0)
        expect(max).toBeLessThanOrEqual(4095)

        decoder.delete()
      }
    )

    it.skipIf(!isBuilt)("rejects 8-bit JPEG input (precision guard)", () => {
      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(jpeg8bit.length).set(jpeg8bit)
      expect(() => decoder.decode()).toThrow()
      decoder.delete()
    })

    // libjpeg-turbo's 12-bit code path returns partial output on a
    // truncated stream rather than throwing (unlike the 8-bit decoder,
    // which throws). Leave a placeholder so the behaviour is documented.
    it.todo("handles truncated 12-bit input (currently returns partial)")
  }
)
