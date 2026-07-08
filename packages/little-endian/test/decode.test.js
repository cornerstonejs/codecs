import { describe, it, expect } from "vitest"
import decode from "../src/index.js"

describe("little-endian decode", () => {
  it("decodes 16-bit unsigned pixel data into Uint16Array", () => {
    const pixelData = new Uint8Array([0x01, 0x00, 0x02, 0x00, 0xff, 0x00])
    const imageFrame = { bitsAllocated: 16, pixelRepresentation: 0 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Uint16Array)
    expect(imageFrame.pixelData.length).toBe(3)
    expect(Array.from(imageFrame.pixelData)).toEqual([1, 2, 255])
  })

  it("decodes 16-bit signed pixel data into Int16Array", () => {
    const pixelData = new Uint8Array([0xff, 0xff, 0xfe, 0xff])
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

  it("passes 1-bit pixel data through unchanged", () => {
    const pixelData = new Uint8Array([0b10101010])
    const imageFrame = { bitsAllocated: 1 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBe(pixelData)
  })

  it("decodes 32-bit pixel data into Float32Array", () => {
    const source = new Float32Array([1.5, -2.25, 3.75])
    const pixelData = new Uint8Array(source.buffer)
    const imageFrame = { bitsAllocated: 32 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Float32Array)
    expect(Array.from(imageFrame.pixelData)).toEqual([1.5, -2.25, 3.75])
  })

  it("realigns 16-bit pixel data when byteOffset is odd", () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x00, 0x02, 0x00]).buffer
    const pixelData = new Uint8Array(buffer, 1, 4)
    const imageFrame = { bitsAllocated: 16, pixelRepresentation: 0 }

    decode(imageFrame, pixelData)

    expect(imageFrame.pixelData).toBeInstanceOf(Uint16Array)
    expect(imageFrame.pixelData.length).toBe(2)
    expect(Array.from(imageFrame.pixelData)).toEqual([1, 2])
  })

  it("returns the same imageFrame object", () => {
    const imageFrame = { bitsAllocated: 8 }
    const result = decode(imageFrame, new Uint8Array([0]))

    expect(result).toBe(imageFrame)
  })
})
