#!/usr/bin/env node
// Runs a small decode/encode benchmark for one codec package and emits a JSON
// summary on stdout. Designed to be cheap, deterministic, and parseable by
// scripts/ci/post-benchmark-comment.js.
//
// Usage:
//   node scripts/ci/benchmark.js <package> <side>
//
//   <package>  one of: charls | libjpeg-turbo-8bit | libjpeg-turbo-12bit |
//                       openjpeg | openjphjs | little-endian | big-endian |
//                       dicom-codec
//   <side>     a free-form label ("pr" or "main") echoed into the JSON.
//
// The script never fails the CI step on benchmark errors — it writes a JSON
// with `error` set and exits 0. The post-comment step decides how to render
// missing data.

"use strict"

const fs = require("node:fs")
const path = require("node:path")

const ITERATIONS = parseInt(process.env.BENCHMARK_ITERATIONS || "20", 10)

const packageName = process.argv[2]
const side = process.argv[3] || "unknown"

if (!packageName) {
  console.error("usage: node benchmark.js <package> <side>")
  process.exit(2)
}

const REPO_ROOT = path.resolve(__dirname, "../..")
const pkgDir = path.join(REPO_ROOT, "packages", packageName)

function timeIt(fn) {
  const start = process.hrtime.bigint()
  for (let i = 0; i < ITERATIONS; i++) fn()
  const end = process.hrtime.bigint()
  return Number(end - start) / 1e6 / ITERATIONS // ms per iteration
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

async function loadFactory(distRelPath) {
  const distPath = path.join(pkgDir, distRelPath)
  if (!fs.existsSync(distPath)) return null
  // wasm/asm.js builds export a CJS factory function
  return require(distPath)
}

const fixturesDir = path.join(pkgDir, "test/fixtures")

async function benchCharLS() {
  const factory = await loadFactory("dist/charlswasm.js")
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
  const factory = await loadFactory("dist/libjpegturbowasm.js")
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
  const factory = await loadFactory("dist/libjpegturbo12wasm.js")
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

async function benchOpenJpeg() {
  const factory = await loadFactory("dist/openjpegwasm.js")
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
  const factory = await loadFactory("dist/openjphjs.js")
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

async function benchEndian(which) {
  const srcPath = path.join(pkgDir, "src/index.js")
  if (!fs.existsSync(srcPath)) return emit({ error: "src missing" })
  // ESM source — use dynamic import
  const mod = await import(srcPath)
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
  // No standalone benchmark — dispatcher overhead is dominated by the underlying
  // codec. Emit a no-op record so the comment still has a row for this package.
  emit({ operation: "noop", fixture: "(dispatcher only)", meanMs: 0, encodedBytes: 0, note: "dispatcher has no standalone benchmark" })
}

const benchmarks = {
  charls: benchCharLS,
  "libjpeg-turbo-8bit": benchLibJpeg8,
  "libjpeg-turbo-12bit": benchLibJpeg12,
  openjpeg: benchOpenJpeg,
  openjphjs: benchOpenJph,
  "little-endian": () => benchEndian("little"),
  "big-endian": () => benchEndian("big"),
  "dicom-codec": benchDicomCodec,
}

const fn = benchmarks[packageName]
if (!fn) {
  emit({ error: `unknown package: ${packageName}` })
  process.exit(0)
}

fn().catch((err) => {
  emit({ error: String(err?.message ?? err) })
})
