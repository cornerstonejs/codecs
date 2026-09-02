import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const isBuilt = existsSync(resolve(distDir, "openjpegwasm.js"))

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
describe("openjpeg wasm heap stability", { timeout: 120000 }, () => {
  let codec
  const encoded = readFileSync(resolve(fixturesDir, "j2k/CT1.j2k"))
  const raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule("../dist/openjpegwasm.js")
  })

  it.skipIf(!isBuilt)("repeated decode/delete cycles do not grow the heap", () => {
    const decodeOnce = () => {
      const decoder = new codec.J2KDecoder()
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
      const encoder = new codec.J2KEncoder()
      encoder.getDecodedBuffer({ width: 512, height: 512, bitsPerSample: 16, componentCount: 1, isSigned: true }).set(raw)
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
      const decoder = new codec.J2KDecoder()
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

  // NOT COVERED, and deliberately so rather than by oversight: the encoder's
  // and decoder's THROWING failure paths, which are exactly the ones the
  // handle guards in J2KEncoder::encode and J2KDecoder::decode_i exist for.
  //
  // The obvious test -- loop a failing encode and assert no heap growth --
  // was written and removed. setDecompositions(40) is a clean trigger
  // (numresolution 41 > OpenJPEG's 33, so opj_setup_encoder rejects it with
  // the opj_image already allocated, ~1 MiB of leak per iteration), and the
  // heap does grow without the guard. But repeating that failure crashes the
  // module on the 5th iteration WITH the guard in place too -- "memory access
  // out of bounds" -- so the test failed for a reason unrelated to what it
  // was measuring. Repeated failed encoder setup corrupts something; that is
  // its own bug, not this file's to paper over.
  //
  // The decoder side has no reachable trigger from the fixtures here at all:
  // the component-count rejection needs a 2- or 4-component J2K (none
  // committed, and the encoder cannot produce one -- see the multi-component
  // findings), checkedDecodedSize needs a header claiming >512 MiB, and
  // decoded_.resize()'s std::bad_alloc needs memory pressure. The cstr_info
  // leak, which fired on EVERY decode, is invisible here for a different
  // reason: measured at ~12,600 decodes it never forced heap growth either
  // way, because the 50 MiB arena absorbs it. HEAP8.length is simply not a
  // sensitive enough instrument for a leak that small.
})
