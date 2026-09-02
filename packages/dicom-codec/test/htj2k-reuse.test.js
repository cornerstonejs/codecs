import { beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packagesRoot = resolve(__dirname, "../..")

const OPENJPH_BUILT = existsSync(
  resolve(packagesRoot, "openjphjs/dist/openjphjs.js")
)

const HTJ2K_UID = "1.2.840.10008.1.2.4.201"

const imageInfo = {
  rows: 512,
  columns: 512,
  bitsAllocated: 16,
  samplesPerPixel: 1,
  pixelRepresentation: 1,
  signed: true,
}

// Too short to carry a SIZ marker, so openjph's header parse fails. It does NOT
// throw out to JS — HTJ2KDecoder swallows the exception so that streaming
// consumers keep partial images — which is precisely why the dispatcher has to
// interrogate the decoder's status.
const UNDECODABLE = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

it.runIf(process.env.CI)("openjph dist is present in CI", () => {
  expect(OPENJPH_BUILT, "openjphjs/dist missing — artifacts not replayed").toBe(
    true
  )
})

describe.skipIf(!OPENJPH_BUILT)("HTJ2K decoder reuse", () => {
  let dicomCodec
  let j2cBytes

  beforeAll(async () => {
    const mod = await import("../src/index.js")
    dicomCodec = mod.default ?? mod
    j2cBytes = readFileSync(
      resolve(packagesRoot, "openjphjs/test/fixtures/j2c/CT1.j2c")
    )
  })

  it("returns independent buffers across successive decodes", async () => {
    // The failure this guards: getDecodedBuffer() hands back a live view onto
    // the decoder's wasm heap, and htj2k.js reuses one decoder for the whole
    // series. Returning that view unchanged meant every frame a caller had held
    // onto turned into the most recently decoded one — a viewer scrolling a
    // series would show the last slice at every index.
    const first = await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)
    const firstSnapshot = Uint8Array.from(
      new Uint8Array(
        first.imageFrame.buffer,
        first.imageFrame.byteOffset,
        first.imageFrame.byteLength
      )
    )

    const second = await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)

    // Compared as a boolean on purpose. When these ARE the same object it is
    // the whole wasm heap (INITIAL_MEMORY=50mb), and letting vitest diff two
    // 50 MB ArrayBuffers exhausts the JS heap before it can print anything.
    expect(first.imageFrame.buffer === second.imageFrame.buffer).toBe(false)

    // Each frame owns a buffer sized exactly to itself, rather than a window
    // into the codec's heap — so passing imageFrame.buffer to a worker or
    // wrapping it in another view transfers the frame, not 50 MB of wasm memory.
    expect(first.imageFrame.buffer.byteLength).toBe(first.imageFrame.byteLength)
    expect(first.imageFrame.byteOffset).toBe(0)

    // The second decode must not have written through the first result.
    const firstAfter = new Uint8Array(
      first.imageFrame.buffer,
      first.imageFrame.byteOffset,
      first.imageFrame.byteLength
    )
    expect(Buffer.from(firstAfter).equals(Buffer.from(firstSnapshot))).toBe(true)

    // Same input, so the pixels themselves must still match.
    const secondBytes = new Uint8Array(
      second.imageFrame.buffer,
      second.imageFrame.byteOffset,
      second.imageFrame.byteLength
    )
    expect(Buffer.from(secondBytes).equals(Buffer.from(firstSnapshot))).toBe(
      true
    )
  })

  it("rejects an undecodable frame instead of returning the previous one", async () => {
    // Decode a good frame first so the reused decoder is holding 512*512*2
    // bytes of real pixel data. A header failure leaves that buffer untouched,
    // so without a status check this resolves successfully with the previous
    // slice's pixels under the new frame's imageInfo.
    await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)

    await expect(
      dicomCodec.decode(UNDECODABLE, imageInfo, HTJ2K_UID)
    ).rejects.toThrow(/decode failed/i)
  })

  it("recovers after an undecodable frame", async () => {
    await expect(
      dicomCodec.decode(UNDECODABLE, imageInfo, HTJ2K_UID)
    ).rejects.toThrow()

    const result = await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)
    expect(result.imageInfo.width).toBe(512)
    expect(result.imageInfo.height).toBe(512)
    expect(result.imageFrame.byteLength).toBe(512 * 512 * 2)
  })

  it("release() frees the reused decoder and decoding still works after", async () => {
    const before = await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)

    expect(dicomCodec.release(HTJ2K_UID)).toBe(true)
    // Nothing left to release the second time.
    expect(dicomCodec.release(HTJ2K_UID)).toBe(false)

    const after = await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)

    expect(after.imageFrame.byteLength).toBe(before.imageFrame.byteLength)
    expect(
      Buffer.from(
        new Uint8Array(
          after.imageFrame.buffer,
          after.imageFrame.byteOffset,
          after.imageFrame.byteLength
        )
      ).equals(
        Buffer.from(
          new Uint8Array(
            before.imageFrame.buffer,
            before.imageFrame.byteOffset,
            before.imageFrame.byteLength
          )
        )
      )
    ).toBe(true)
  })

  it("release() with no argument covers every codec and is safe to repeat", async () => {
    await dicomCodec.decode(j2cBytes, imageInfo, HTJ2K_UID)

    expect(dicomCodec.release()).toBe(true)
    expect(dicomCodec.release()).toBe(false)
  })

  it("release() throws for an unknown transfer syntax", () => {
    expect(() => dicomCodec.release("9.9.9.9")).toThrow(
      /unknown transfer syntax/i
    )
  })
})
