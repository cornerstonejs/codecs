import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const ct1Encoded = readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
const ct1Raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))
const ct2Encoded = readFileSync(resolve(fixturesDir, "j2c/CT2.j2c"))
const ct2Raw = readFileSync(resolve(fixturesDir, "raw/CT2.RAW"))

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

const modulePath = "../dist/openjphjs.js"
const isBuilt = existsSync(resolve(distDir, "openjphjs.js"))

describe("openjphjs HTJ2K decode", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(modulePath)
  })

  it.skipIf(!isBuilt)(
    "decodes CT1.j2c to a 512x512 16-bit monochrome frame matching CT1.RAW",
    () => {
      const decoder = new codec.HTJ2KDecoder()
      decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
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

  it.skipIf(!isBuilt)("decodes CT2.j2c losslessly to CT2.RAW", () => {
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(ct2Encoded.length).set(ct2Encoded)
    decoder.decode()

    const decoded = decoder.getDecodedBuffer()
    expect(Buffer.from(decoded).equals(ct2Raw)).toBe(true)

    decoder.delete()
  })
})

describe("openjphjs HTJ2K encode + round-trip", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(modulePath)
  })

  it.skipIf(!isBuilt)(
    "encodes CT1.RAW and decodes back to original bytes (lossless)",
    () => {
      const frameInfo = {
        width: 512,
        height: 512,
        bitsPerSample: 16,
        componentCount: 1,
        isSigned: true,
        isUsingColorTransform: false,
      }
      const encoder = new codec.HTJ2KEncoder()
      encoder.getDecodedBuffer(frameInfo).set(ct1Raw)
      encoder.encode()
      const encoded = encoder.getEncodedBuffer()
      expect(encoded.length).toBeGreaterThan(0)

      const decoder = new codec.HTJ2KDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()
      const decoded = decoder.getDecodedBuffer()

      expect(decoded.length).toBe(ct1Raw.length)
      expect(Buffer.from(decoded).equals(ct1Raw)).toBe(true)

      encoder.delete()
      decoder.delete()
    }
  )
})
