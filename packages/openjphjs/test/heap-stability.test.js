import { beforeAll, describe, expect, it } from "vitest"
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

// Emscripten heaps grow but never shrink, so a native-side leak shows up as
// monotonic HEAP8 growth across repeated use — invisible to single-decode
// tests, an OOM after thousands of frames in a viewer. This repo has a
// history of exactly that class of bug (error-path instance leaks, encoder
// handle leaks).
//
// Loop sizing matters: the arena starts at 50 MiB (INITIAL_MEMORY) with
// ALLOW_MEMORY_GROWTH, so a leak only becomes visible once the leaked
// instances exceed the arena's free slack; 100+ instance-sized leaks
// comfortably exceed it (see the charls twin of this file for the
// calibration measurements).
describe("openjphjs wasm heap stability", { timeout: 120000 }, () => {
  let codec
  const encoded = readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
  const raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjphjs.js")
  })

  it.skipIf(!isBuilt)("repeated decode/delete cycles do not grow the heap", () => {
    const decodeOnce = () => {
      const decoder = new codec.HTJ2KDecoder()
      decoder.getEncodedBuffer(encoded.length).set(encoded)
      decoder.decode()
      decoder.delete()
    }
    for (let i = 0; i < 10; i++) decodeOnce()
    const settled = codec.HEAP8.length
    for (let i = 0; i < 100; i++) decodeOnce()
    expect(codec.HEAP8.length).toBe(settled)
  })

  it.skipIf(!isBuilt)("repeated encode/delete cycles do not grow the heap", () => {
    const encodeOnce = () => {
      const encoder = new codec.HTJ2KEncoder()
      encoder.getDecodedBuffer({ width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true, isUsingColorTransform: false }).set(raw)
      encoder.encode()
      encoder.delete()
    }
    for (let i = 0; i < 10; i++) encodeOnce()
    const settled = codec.HEAP8.length
    for (let i = 0; i < 60; i++) encodeOnce()
    expect(codec.HEAP8.length).toBe(settled)
  })

  it.skipIf(!isBuilt)("repeated failing decodes do not grow the heap", () => {
    // Garbage (not truncated-after-valid-header) input: fails fast at
    // header parse instead of spending seconds in sample recovery, so the
    // loop can be large enough for a leak to exceed the arena slack.
    const garbage = new Uint8Array(64)
    for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 37 + 11) % 256
    const failOnce = () => {
      const decoder = new codec.HTJ2KDecoder()
      decoder.getEncodedBuffer(garbage.length).set(garbage)
      try {
        decoder.decode()
      } catch {
        // expected for malformed input
      }
      decoder.delete()
    }
    for (let i = 0; i < 10; i++) failOnce()
    const settled = codec.HEAP8.length
    for (let i = 0; i < 100; i++) failOnce()
    expect(codec.HEAP8.length).toBe(settled)
  })
})
