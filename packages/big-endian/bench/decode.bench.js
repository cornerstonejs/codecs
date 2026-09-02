import { bench, describe } from "vitest"
import decode from "../src/index.js"

const SIZE_512x512 = 512 * 512

function makeBuffer(byteLen) {
  const data = new Uint8Array(byteLen)
  for (let i = 0; i < byteLen; i++) data[i] = (i * 37) & 0xff
  return data
}

describe("big-endian decode (byte-swap)", () => {
  const data16 = makeBuffer(SIZE_512x512 * 2)

  bench("16-bit unsigned + swap, 512x512", () => {
    decode({ bitsAllocated: 16, pixelRepresentation: 0 }, data16)
  })

  bench("16-bit signed + swap, 512x512", () => {
    decode({ bitsAllocated: 16, pixelRepresentation: 1 }, data16)
  })

  // The 16-bit benches above do real per-pixel swap work and are left
  // unbatched. The 8-bit path is a bare property assignment, so a single
  // call is swamped by fixed harness overhead and cache-model variation
  // across runner CPUs; batch x100 so the body is measurable.
  const data8 = makeBuffer(SIZE_512x512)
  bench("8-bit passthrough, 512x512 x100", () => {
    for (let i = 0; i < 100; i++) {
      decode({ bitsAllocated: 8 }, data8)
    }
  })
})
