import { beforeAll, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "openjphjs.js"))

async function loadModule(path) {
  const mod = await import(path)
  const factory = mod.default ?? mod
  return await factory()
}

// Header introspection and progressive (sub-resolution) decode — the
// viewer's progressive-loading path, previously untested.
describe("openjphjs HTJ2K API surface", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjphjs.js")
  })

  it.runIf(process.env.CI)("dist is present in CI", () => {
    expect(isBuilt, "openjphjs.js missing — build artifact was not replayed").toBe(true)
  })

  it.skipIf(!isBuilt)("readHeader() populates frameInfo and decomposition info without decoding", () => {
    const encoded = readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.readHeader()

    expect(decoder.getFrameInfo()).toEqual({
      width: 512,
      height: 512,
      bitsPerSample: 16,
      componentCount: 1,
      isSigned: true,
      isUsingColorTransform: false,
    })
    expect(decoder.getNumDecompositions()).toBe(5)
    expect(decoder.calculateSizeAtDecompositionLevel(0)).toEqual({ width: 512, height: 512 })
    expect(decoder.calculateSizeAtDecompositionLevel(1)).toEqual({ width: 256, height: 256 })
    expect(decoder.calculateSizeAtDecompositionLevel(2)).toEqual({ width: 128, height: 128 })

    decoder.delete()
  })

  it.skipIf(!isBuilt)("decodeSubResolution(1) produces the level-1 image", () => {
    const encoded = readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decodeSubResolution(1)
    const sub1 = Buffer.from(decoder.getDecodedBuffer())
    decoder.delete()

    expect(sub1.length).toBe(256 * 256 * 2)
    // Cross-codec validated pin: openjpeg's decodeSubResolution(1, 0) on
    // CT1.j2k produces this byte-identical buffer — the reversible 5/3
    // LL band at each resolution level is mathematically shared between
    // J2K and HTJ2K encodes of the same source.
    expect(createHash("sha256").update(sub1).digest("hex")).toBe(
      "b6c934cad65758b2c90b5b7e2bea6ca2cd96574b547bb6720f1ca405e791abee"
    )
  })
})
