// Cold vs warm decoder benches.
//
// "cold" = a fresh decoder/encoder instance whose first .decode()/.encode()
// call happens INSIDE the bench body. This models the first frame a worker
// processes after spinning up (cornerstone3D's decodeImageFrameWorker.js
// has no explicit warmup, so frame 1 in each worker is cold).
//
// "warm" = a shared decoder/encoder that has already done 5 decode/encode
// passes at module load (untimed). The bench body is the 6th+ call. This
// models frames 2..N in a worker session, which is the dominant case for
// stack scrolling. Per cornerstone3D's decodeJPEGBaseline8Bit.ts:61 the
// decoder is cached on `local.decoder` and reused for every frame.
//
// Bench bodies are symmetric (same code shape) between cold and warm —
// the only difference is module-load state, so the cold/warm delta
// isolates the cost of "first call setup" (wasm heap grow, page-touch,
// V8 tier-up) versus pure kernel time.
//
// Warmup uses jpeg400jfif (the only decode fixture for this package);
// for codecs with multiple fixtures, warmup uses the largest so the
// warm decoder's internal buffers never need to regrow.
//
// A separate "instantiate+destroy" bench measures the per-instance
// lifecycle cost in isolation.

import { bench, describe } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, "../dist")
const fixturesDir = resolve(__dirname, "../test/fixtures")

const distPath = resolve(distDir, "libjpegturbowasm.js")
const skip = !existsSync(distPath)

const jpegEncoded = !skip
  ? readFileSync(resolve(fixturesDir, "jpeg/jpeg400jfif.jpg"))
  : null
const rawDecoded = !skip
  ? readFileSync(resolve(fixturesDir, "raw/jpeg400jfif.raw"))
  : null

const encoderImageInfo = {
  width: 600,
  height: 800,
  bitsPerSample: 8,
  componentCount: 1,
  isSigned: false,
}

let codec
let coldDec
let warmDec
let coldEnc
let warmEnc
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()

  // Cold instances: just construct, never decode/encode at module load.
  // The bench body will be the first call into the decoder/encoder.
  coldDec = new codec.JPEGDecoder()
  coldEnc = new codec.JPEGEncoder()

  // Warm instances: construct and run 5 untimed iterations so V8 tiers
  // up the wasm decode path, the wasm heap stabilizes, and output pages
  // are pre-touched. The bench body is the 6th call.
  warmDec = new codec.JPEGDecoder()
  for (let i = 0; i < 5; i++) {
    warmDec.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
    warmDec.decode()
  }

  warmEnc = new codec.JPEGEncoder()
  for (let i = 0; i < 5; i++) {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(rawDecoded)
    warmEnc.encode()
  }
}

describe.skipIf(skip)("libjpeg-turbo-8bit (wasm)", () => {
  bench("instantiate+destroy JPEGDecoder", () => {
    const d = new codec.JPEGDecoder()
    d.delete()
  })

  bench("instantiate+destroy JPEGEncoder", () => {
    const e = new codec.JPEGEncoder()
    e.delete()
  })

  bench("decode jpeg400jfif.jpg (600x800x8bit) — cold", () => {
    coldDec.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
    coldDec.decode()
  })

  bench("decode jpeg400jfif.jpg (600x800x8bit) — warm", () => {
    warmDec.getEncodedBuffer(jpegEncoded.length).set(jpegEncoded)
    warmDec.decode()
  })

  bench("encode raw 600x800x8bit (lossy default) — cold", () => {
    coldEnc.getDecodedBuffer(encoderImageInfo).set(rawDecoded)
    coldEnc.encode()
  })

  bench("encode raw 600x800x8bit (lossy default) — warm", () => {
    warmEnc.getDecodedBuffer(encoderImageInfo).set(rawDecoded)
    warmEnc.encode()
  })
})
