#!/usr/bin/env node
// Runs a small decode/encode benchmark for one codec package and emits a JSON
// summary on stdout. Used by the per-PR sticky comment in
// scripts/ci/post-benchmark-comment.js. The deeper, hardware-independent
// benchmarks live in each package's bench/ directory and are run by
// CodSpeed; this script intentionally stays light.
//
// Usage:
//   node scripts/ci/benchmark.mjs <package> <side>
//
// Never fails the CI step: errors are emitted as {error: ...} and exit is 0.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const ITERATIONS = parseInt(process.env.BENCHMARK_ITERATIONS || "20", 10)

const packageName = process.argv[2]
const side = process.argv[3] || "unknown"

if (!packageName) {
  console.error("usage: node benchmark.mjs <package> <side>")
  process.exit(2)
}

const REPO_ROOT = path.resolve(__dirname, "../..")
const pkgDir = path.join(REPO_ROOT, "packages", packageName)

function timeIt(fn) {
  const start = process.hrtime.bigint()
  for (let i = 0; i < ITERATIONS; i++) fn()
  const end = process.hrtime.bigint()
  return Number(end - start) / 1e6 / ITERATIONS
}

function emit(record) {
  const out = {
    package: packageName,
    side,
    iterations: ITERATIONS,
    timestamp: new Date().toISOString(),
    ...record,
  }
  process.stdout.write(JSON.stringify(out) + "\n")
}

function loadFactory(distRelPath) {
  const distPath = path.join(pkgDir, distRelPath)
  if (!fs.existsSync(distPath)) return null
  // wasm/asm.js builds are CJS — load via createRequire so this works under
  // both Node 18 and Node 20+.
  return require(distPath)
}

const fixturesDir = path.join(pkgDir, "test/fixtures")

async function benchCharLS() {
  const factory = loadFactory("dist/charlswasm.js")
  if (!factory) return emit({ error: "dist not built" })
  const codec = await factory()
  const encoded = fs.readFileSync(path.join(fixturesDir, "CT2.JLS"))

  const decodeMs = timeIt(() => {
    const decoder = new codec.JpegLSDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    decoder.delete()
  })

  emit({ operation: "decode", fixture: "CT2.JLS", meanMs: decodeMs, encodedBytes: encoded.length })
}

async function benchLibJpeg8() {
  const factory = loadFactory("dist/libjpegturbowasm.js")
  if (!factory) return emit({ error: "dist not built" })
  const codec = await factory()
  const encoded = fs.readFileSync(path.join(fixturesDir, "jpeg/jpeg400jfif.jpg"))

  const decodeMs = timeIt(() => {
    const decoder = new codec.JPEGDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    decoder.delete()
  })

  emit({ operation: "decode", fixture: "jpeg400jfif.jpg", meanMs: decodeMs, encodedBytes: encoded.length })
}

async function benchLibJpeg12() {
  // No real 12-bit fixture exists in the repo, and the 12-bit decoder
  // rejects 8-bit jpeg400jfif.jpg with "Unsupported JPEG data precision 8".
  // Fall back to a microbench of decoder instantiation so the comment row
  // is informative instead of an error.
  const factory = loadFactory("dist/libjpegturbo12wasm.js")
  if (!factory) return emit({ error: "dist not built" })
  const codec = await factory()

  const ms = timeIt(() => {
    const d = new codec.JPEGDecoder()
    d.delete()
  })

  emit({
    operation: "instantiate",
    fixture: "(no 12-bit fixture available)",
    meanMs: ms,
    encodedBytes: 0,
    note: "decoder instantiation only — add a real 12-bit JPEG fixture for throughput numbers",
  })
}

async function benchOpenJpeg() {
  const factory = loadFactory("dist/openjpegwasm.js")
  if (!factory) return emit({ error: "dist not built" })
  const codec = await factory()
  const encoded = fs.readFileSync(path.join(fixturesDir, "j2k/CT1.j2k"))

  const decodeMs = timeIt(() => {
    const decoder = new codec.J2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    decoder.delete()
  })

  emit({ operation: "decode", fixture: "CT1.j2k", meanMs: decodeMs, encodedBytes: encoded.length })
}

async function benchOpenJph() {
  const factory = loadFactory("dist/openjphjs.js")
  if (!factory) return emit({ error: "dist not built" })
  const codec = await factory()
  const encoded = fs.readFileSync(path.join(fixturesDir, "j2c/CT1.j2c"))

  const decodeMs = timeIt(() => {
    const decoder = new codec.HTJ2KDecoder()
    decoder.getEncodedBuffer(encoded.length).set(encoded)
    decoder.decode()
    decoder.delete()
  })

  emit({ operation: "decode", fixture: "CT1.j2c", meanMs: decodeMs, encodedBytes: encoded.length })
}

async function benchEndian() {
  // The endian packages' src/index.js is ESM (`export default decode`)
  // without `"type": "module"` in their package.json. Node 18 (the CI
  // executor) does not auto-detect that and fails with
  // "Unexpected token 'export'". Load the webpack-built CJS dist instead.
  const distPath = path.join(pkgDir, "dist/index.js")
  if (!fs.existsSync(distPath)) return emit({ error: "dist not built" })
  const mod = require(distPath)
  const decode = mod.default ?? mod

  const SIZE = 512 * 512
  const pixelData = new Uint8Array(SIZE * 2)
  for (let i = 0; i < pixelData.length; i++) pixelData[i] = (i * 37) & 0xff

  const ms = timeIt(() => {
    decode({ bitsAllocated: 16, pixelRepresentation: 0 }, pixelData)
  })

  emit({ operation: "decode", fixture: "synthetic 512x512x16", meanMs: ms, encodedBytes: pixelData.length })
}

async function benchDicomCodec() {
  emit({
    operation: "noop",
    fixture: "(dispatcher only)",
    meanMs: 0,
    encodedBytes: 0,
    note: "dispatcher has no standalone benchmark — see CodSpeed for end-to-end numbers",
  })
}

const benchmarks = {
  charls: benchCharLS,
  "libjpeg-turbo-8bit": benchLibJpeg8,
  "libjpeg-turbo-12bit": benchLibJpeg12,
  openjpeg: benchOpenJpeg,
  openjphjs: benchOpenJph,
  "little-endian": benchEndian,
  "big-endian": benchEndian,
  "dicom-codec": benchDicomCodec,
}

const fn = benchmarks[packageName]
if (!fn) {
  emit({ error: `unknown package: ${packageName}` })
  process.exit(0)
}

try {
  await fn()
} catch (err) {
  emit({ error: String(err?.message ?? err) })
}
