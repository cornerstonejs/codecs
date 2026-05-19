import { bench, describe } from "vitest"
import decode from "../src/index.js"

const SIZE_512x512 = 512 * 512

function makeBuffer(byteLen) {
  const data = new Uint8Array(byteLen)
  for (let i = 0; i < byteLen; i++) data[i] = (i * 37) & 0xff
  return data
}

describe("little-endian decode", () => {
  const data16 = makeBuffer(SIZE_512x512 * 2)

  bench("16-bit unsigned, 512x512", () => {
    decode({ bitsAllocated: 16, pixelRepresentation: 0 }, data16)
  })

  bench("16-bit signed, 512x512", () => {
    decode({ bitsAllocated: 16, pixelRepresentation: 1 }, data16)
  })

  const data8 = makeBuffer(SIZE_512x512)
  bench("8-bit passthrough, 512x512", () => {
    decode({ bitsAllocated: 8 }, data8)
  })

  const data32 = makeBuffer(SIZE_512x512 * 4)
  bench("32-bit float, 512x512", () => {
    decode({ bitsAllocated: 32 }, data32)
  })
})
