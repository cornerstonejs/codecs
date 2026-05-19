import { describe, it, expect } from "vitest"
import decode from "../src/index.js"

describe("big-endian decode", () => {
  it("byte-swaps 16-bit unsigned pixel data into Uint16Array", () => {
    const pixelData = new Uint8Array([0x00, 0x01, 0x00, 0x02, 0x12, 0x34])
    const imageFrame = { bitsAllocated: 16, pixelRepresentation: 0 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Uint16Array)
    expect(imageFrame.pixelData.length).toBe(3)
    expect(Array.from(imageFrame.pixelData)).toEqual([1, 2, 0x1234])
  })

  it("byte-swaps 16-bit signed pixel data into Int16Array", () => {
    const pixelData = new Uint8Array([0xff, 0xff, 0xff, 0xfe])
    const imageFrame = { bitsAllocated: 16, pixelRepresentation: 1 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Int16Array)
    expect(Array.from(imageFrame.pixelData)).toEqual([-1, -2])
  })

  it("passes 8-bit pixel data through unchanged", () => {
    const pixelData = new Uint8Array([1, 2, 3, 4])
    const imageFrame = { bitsAllocated: 8 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBe(pixelData)
  })

  it("realigns 16-bit pixel data when byteOffset is odd", () => {
    const buffer = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x02]).buffer
    const pixelData = new Uint8Array(buffer, 1, 4)
    const imageFrame = { bitsAllocated: 16, pixelRepresentation: 0 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Uint16Array)
    expect(Array.from(imageFrame.pixelData)).toEqual([1, 2])
  })

  it("returns the same imageFrame object", () => {
    const imageFrame = { bitsAllocated: 8 }
    const result = decode(imageFrame, new Uint8Array([0]))

    expect(result).toBe(imageFrame)
  })
})
