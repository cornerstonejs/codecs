// libjpeg-turbo-12bit benchmarks are minimal — the encoder bindings are
// commented out in src/jslib.cpp and there is no real 12-bit JPEG fixture
// checked in, so we can only exercise decoder instantiation. Real
// throughput numbers will arrive once a 12-bit fixture is added to
// test/fixtures/jpeg/ and a proper decode bench is wired up here.

import { bench, describe } from "vitest"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(__dirname, "../dist/libjpegturbo12wasm.js")
const skip = !existsSync(distPath)

let codec
if (!skip) {
  const factory = (await import(distPath)).default ?? (await import(distPath))
  codec = await factory()
}

describe.skipIf(skip)("libjpeg-turbo-12bit (wasm)", () => {
  bench("decoder instantiate + delete", () => {
    const d = new codec.JPEGDecoder()
    d.delete()
  })
})
