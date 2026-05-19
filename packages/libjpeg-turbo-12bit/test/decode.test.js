import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

// This package compiles libjpeg-turbo with WITH12BIT=ON and only binds the
// JPEGDecoder (the JPEGEncoder bindings in src/jslib.cpp are commented out).
// The only fixture in the repo is jpeg400jfif.jpg, which is an 8-bit JPEG —
// the 12-bit decoder rejects it with "Unsupported JPEG data precision 8".
// We use that to verify the precision guard, plus a smoke check that the
// decoder can be instantiated, until a real 12-bit JPEG fixture is added.

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

    it.skipIf(!isBuilt)("instantiates a JPEGDecoder", () => {
      const decoder = new codec.JPEGDecoder()
      expect(decoder).toBeDefined()
      expect(typeof decoder.decode).toBe("function")
      expect(typeof decoder.getFrameInfo).toBe("function")
      decoder.delete()
    })

    it.skipIf(!isBuilt)("rejects 8-bit JPEG input (precision guard)", () => {
      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(jpeg8bit.length).set(jpeg8bit)
      expect(() => decoder.decode()).toThrow()
      decoder.delete()
    })

    it.skipIf(!isBuilt)("throws on truncated input", () => {
      const truncated = jpeg8bit.subarray(0, Math.floor(jpeg8bit.length / 2))
      const decoder = new codec.JPEGDecoder()
      decoder.getEncodedBuffer(truncated.length).set(truncated)
      expect(() => decoder.decode()).toThrow()
      decoder.delete()
    })

    it.todo(
      "decodes a real 12-bit JPEG fixture (TODO: add one to test/fixtures/jpeg/)"
    )
  }
)
