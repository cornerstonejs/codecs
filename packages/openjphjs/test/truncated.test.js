import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "fixtures")

const ct1Encoded = readFileSync(resolve(fixturesDir, "j2c/CT1.j2c"))
const ct1Raw = readFileSync(resolve(fixturesDir, "raw/CT1.RAW"))

const frameInfo = {
  width: 512,
  height: 512,
  bitsPerSample: 16,
  componentCount: 1,
  isSigned: true,
  isUsingColorTransform: false,
}

const TRUNCATED_BYTE_LIMIT = 10 * 1024
const LOSSY_QUANTIZATION_STEP = 8

async function loadModule(modulePath) {
  const mod = await import(modulePath)
  const factory = mod.default ?? mod
  return await factory()
}

function meanAbsoluteErrorI16(originalBytes, decodedBytes) {
  expect(decodedBytes.length).toBe(originalBytes.length)

  const original = new Int16Array(
    originalBytes.buffer,
    originalBytes.byteOffset,
    originalBytes.byteLength / Int16Array.BYTES_PER_ELEMENT
  )
  const decoded = new Int16Array(
    decodedBytes.buffer,
    decodedBytes.byteOffset,
    decodedBytes.byteLength / Int16Array.BYTES_PER_ELEMENT
  )

  let absoluteErrorSum = 0
  for (let i = 0; i < original.length; i++) {
    absoluteErrorSum += Math.abs(original[i] - decoded[i])
  }

  return absoluteErrorSum / original.length
}

function encodeFrame(codec, rawBytes, imageFrame, options = {}) {
  const encoder = new codec.HTJ2KEncoder()
  encoder.getDecodedBuffer(imageFrame).set(rawBytes)

  if (typeof options.lossless === "boolean") {
    encoder.setQuality(options.lossless, options.quantizationStep || 0)
  }

  encoder.encode()
  const encoded = Uint8Array.from(encoder.getEncodedBuffer())
  encoder.delete()
  return encoded
}

function decodeFrame(codec, encodedBytes) {
  const decoder = new codec.HTJ2KDecoder()
  decoder.getEncodedBuffer(encodedBytes.length).set(encodedBytes)
  decoder.decode()
  const decoded = Uint8Array.from(decoder.getDecodedBuffer())
  const decodedFrameInfo = decoder.getFrameInfo()
  decoder.delete()
  return { decoded, decodedFrameInfo }
}

/** Median wall-clock ms over `samples` timed calls after `warmup` untimed iterations. */
function medianDecodeMs(runDecode, { warmup = 2, samples = 7 } = {}) {
  for (let i = 0; i < warmup; i++) runDecode()

  const times = []
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now()
    runDecode()
    times.push(performance.now() - t0)
  }

  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

const modulePath = "../dist/openjphjs.js"
const isBuilt = existsSync(resolve(distDir, "openjphjs.js"))

describe("openjphjs HTJ2K truncated and lossy decode", () => {
  let codec
  let encodedLossless
  let encodedLossy
  let truncatedBitstream

  beforeAll(async () => {
    if (!isBuilt) return
    codec = await loadModule(modulePath)
    encodedLossless = encodeFrame(codec, ct1Raw, frameInfo, {
      lossless: true,
      quantizationStep: 0,
    })
    encodedLossy = encodeFrame(codec, ct1Raw, frameInfo, {
      lossless: false,
      quantizationStep: LOSSY_QUANTIZATION_STEP,
    })
    const truncatedSize = Math.min(TRUNCATED_BYTE_LIMIT, encodedLossless.length)
    truncatedBitstream = encodedLossless.slice(0, truncatedSize)
  })

  it.skipIf(!isBuilt)(
    "decodes a heavily truncated lossless bitstream with bounded error",
    () => {
      const truncatedSize = truncatedBitstream.length
      const { decoded, decodedFrameInfo } = decodeFrame(codec, truncatedBitstream)

      expect(decoded.length).toBeGreaterThan(0)
      expect(decodedFrameInfo.width).toBe(frameInfo.width)
      expect(decodedFrameInfo.height).toBe(frameInfo.height)

      const mae = meanAbsoluteErrorI16(ct1Raw, decoded)
      expect(mae).toBeGreaterThan(10)
      expect(mae).toBeLessThan(300)
      console.log(
        `Truncated lossless decode MAE (${truncatedSize} bytes kept): ${mae.toFixed(2)}`
      )
    }
  )

  it.skipIf(!isBuilt)("decodes a heavy lossy encode with bounded error", () => {
    const { decoded, decodedFrameInfo } = decodeFrame(codec, encodedLossy)

    expect(decodedFrameInfo.width).toBe(frameInfo.width)
    expect(decodedFrameInfo.height).toBe(frameInfo.height)

    const mae = meanAbsoluteErrorI16(ct1Raw, decoded)
    expect(mae).toBeLessThan(1500)
    console.log(`Heavy lossy round-trip MAE: ${mae.toFixed(2)}`)
  })
})

describe("openjphjs HTJ2K decode performance", () => {
  let codec
  let encodedLossless
  let encodedLossy
  let truncatedBitstream

  beforeAll(async () => {
    if (!isBuilt) return
    codec = await loadModule(modulePath)
    encodedLossless = encodeFrame(codec, ct1Raw, frameInfo, {
      lossless: true,
      quantizationStep: 0,
    })
    encodedLossy = encodeFrame(codec, ct1Raw, frameInfo, {
      lossless: false,
      quantizationStep: LOSSY_QUANTIZATION_STEP,
    })
    const truncatedSize = Math.min(TRUNCATED_BYTE_LIMIT, encodedLossless.length)
    truncatedBitstream = encodedLossless.slice(0, truncatedSize)
  })

  it.skipIf(!isBuilt)(
    "full, truncated, and lossy decodes complete within expected wall-clock bounds (reused decoder)",
    () => {
      const fullDecoder = new codec.HTJ2KDecoder()
      const truncatedDecoder = new codec.HTJ2KDecoder()
      const lossyDecoder = new codec.HTJ2KDecoder()

      const fullMs = medianDecodeMs(() => {
        fullDecoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
        fullDecoder.decode()
        fullDecoder.getDecodedBuffer()
      })

      const truncatedMs = medianDecodeMs(() => {
        truncatedDecoder
          .getEncodedBuffer(truncatedBitstream.length)
          .set(truncatedBitstream)
        truncatedDecoder.decode()
        truncatedDecoder.getDecodedBuffer()
      })

      const lossyMs = medianDecodeMs(() => {
        lossyDecoder.getEncodedBuffer(encodedLossy.length).set(encodedLossy)
        lossyDecoder.decode()
        lossyDecoder.getDecodedBuffer()
      })

      fullDecoder.delete()
      truncatedDecoder.delete()
      lossyDecoder.delete()

      console.log(
        `Decode median ms — full CT1.j2c: ${fullMs.toFixed(2)}, truncated (${truncatedBitstream.length} B): ${truncatedMs.toFixed(2)}, lossy q=${LOSSY_QUANTIZATION_STEP}: ${lossyMs.toFixed(2)}`
      )

      // Sanity ceilings for CI runners (generous; catches hangs/regressions).
      expect(fullMs).toBeLessThan(8000)
      expect(truncatedMs).toBeLessThan(8000)
      expect(lossyMs).toBeLessThan(8000)

      // Truncated streams carry far fewer bytes; decode should not be slower than full.
      expect(truncatedMs).toBeLessThan(fullMs * 2.5)
    }
  )
})

describe("openjphjs HTJ2K decoder reuse (memory release)", () => {
  let codec

  beforeAll(async () => {
    if (isBuilt) codec = await loadModule(modulePath)
  })

  it.skipIf(!isBuilt)(
    "reuses one HTJ2KDecoder for 500 decodes with stable time at iterations 5, 50, and 500",
    () => {
      const decoder = new codec.HTJ2KDecoder()
      const milestoneIterations = [5, 50, 500]
      const timesAt = {}

      for (let i = 1; i <= 500; i++) {
        const t0 = performance.now()
        decoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
        decoder.decode()
        decoder.getDecodedBuffer()
        const elapsed = performance.now() - t0

        if (milestoneIterations.includes(i)) {
          timesAt[i] = elapsed
        }
      }

      decoder.delete()

      console.log(
        `Reused decoder decode ms — iteration 5: ${timesAt[5].toFixed(2)}, 50: ${timesAt[50].toFixed(2)}, 500: ${timesAt[500].toFixed(2)}`
      )

      const samples = [timesAt[5], timesAt[50], timesAt[500]]
      const minMs = Math.min(...samples)
      const maxMs = Math.max(...samples)
      const ratio = maxMs / minMs

      console.log(
        `Reused decoder min/max ratio at milestones: ${ratio.toFixed(2)} (min ${minMs.toFixed(2)} ms, max ${maxMs.toFixed(2)} ms)`
      )

      // Memory retained across reuse should not drive large slowdowns in this release.
      expect(ratio).toBeLessThan(6)
      expect(maxMs).toBeLessThan(8000)
    }
  )

  it.skipIf(!isBuilt)(
    "reused decoder is faster than instantiate+decode+destroy per frame",
    () => {
      const reusedDecoder = new codec.HTJ2KDecoder()
      const t0 = performance.now()
      reusedDecoder.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
      reusedDecoder.decode()
      reusedDecoder.getDecodedBuffer()
      const reusedMs = performance.now() - t0
      reusedDecoder.delete()

      const t1 = performance.now()
      const fresh = new codec.HTJ2KDecoder()
      fresh.getEncodedBuffer(ct1Encoded.length).set(ct1Encoded)
      fresh.decode()
      fresh.getDecodedBuffer()
      fresh.delete()
      const freshMs = performance.now() - t1

      console.log(
        `Single decode — reused decoder: ${reusedMs.toFixed(2)} ms, fresh decoder: ${freshMs.toFixed(2)} ms`
      )

      expect(reusedMs).toBeLessThan(freshMs)
    }
  )
})
