#!/usr/bin/env node
// Browser smoke-decode: loads every wasm/asm.js build variant of every
// codec in headless Chromium, decodes its reference fixture IN THE PAGE,
// and compares the SHA-256 of the decoded pixels against the RAW reference.
//
// This is the coverage node tests cannot give: emscripten glue differences
// that only manifest in browsers (wasm URL resolution/locateFile, fetch vs
// filesystem loading, streaming-compile MIME fallbacks) — exactly what
// changes across emsdk versions.
//
// Usage: node tools/browser-smoke/run.js
// Requires: built dists, npx playwright install chromium (cached in CI).
"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright-core");

const repoRoot = path.resolve(__dirname, "../..");

// [package, dist module, decoder class, encoded fixture, reference raw]
// Every entry decodes CT1/jpeg400 and must hash-match its committed RAW.
const VARIANTS = [
  ["charls", "charlsjs.js", "JpegLSDecoder", "charls/test/fixtures/CT1.JLS", "charls/test/fixtures/CT1.RAW"],
  ["charls", "charlswasm.js", "JpegLSDecoder", "charls/test/fixtures/CT1.JLS", "charls/test/fixtures/CT1.RAW"],
  ["charls", "charlswasm_decode.js", "JpegLSDecoder", "charls/test/fixtures/CT1.JLS", "charls/test/fixtures/CT1.RAW"],
  ["openjpeg", "openjpegjs.js", "J2KDecoder", "openjpeg/test/fixtures/j2k/CT1.j2k", "openjpeg/test/fixtures/raw/CT1.RAW"],
  ["openjpeg", "openjpegwasm.js", "J2KDecoder", "openjpeg/test/fixtures/j2k/CT1.j2k", "openjpeg/test/fixtures/raw/CT1.RAW"],
  ["openjpeg", "openjpegwasm_decode.js", "J2KDecoder", "openjpeg/test/fixtures/j2k/CT1.j2k", "openjpeg/test/fixtures/raw/CT1.RAW"],
  ["openjphjs", "openjphjs.js", "HTJ2KDecoder", "openjphjs/test/fixtures/j2c/CT1.j2c", "openjphjs/test/fixtures/raw/CT1.RAW"],
  ["libjpeg-turbo-8bit", "libjpegturbojs.js", "JPEGDecoder", "libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg", "libjpeg-turbo-8bit/test/fixtures/raw/jpeg400jfif.raw"],
  ["libjpeg-turbo-8bit", "libjpegturbowasm.js", "JPEGDecoder", "libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg", "libjpeg-turbo-8bit/test/fixtures/raw/jpeg400jfif.raw"],
  ["libjpeg-turbo-12bit", "libjpegturbo12js.js", "JPEGDecoder", "libjpeg-turbo-12bit/test/fixtures/jpeg/CT-512x512-12bit.jpg", "libjpeg-turbo-12bit/test/fixtures/raw/CT-512x512-12bit.raw"],
  ["libjpeg-turbo-12bit", "libjpegturbo12wasm.js", "JPEGDecoder", "libjpeg-turbo-12bit/test/fixtures/jpeg/CT-512x512-12bit.jpg", "libjpeg-turbo-12bit/test/fixtures/raw/CT-512x512-12bit.raw"],
];

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm", // correct MIME so streaming compilation runs
  ".html": "text/html",
  ".mem": "application/octet-stream",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const filePath = path.join(repoRoot, urlPath);
    if (!filePath.startsWith(repoRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Runs inside the page. The dists are MODULARIZE=1 UMD outputs: loading via
// a classic <script> tag defines a global factory (Module). The .wasm /
// .js.mem sidecars resolve relative to the script URL.
const PAGE_FN = async ({ distUrl, decoderClass, fixtureUrl }) => {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = distUrl;
    s.onload = resolve;
    s.onerror = () => reject(new Error("script load failed: " + distUrl));
    document.head.appendChild(s);
  });
  const factory = globalThis.Module ?? globalThis[Object.keys(globalThis).find((k) => /^(charls|OpenJPEG|openjph|libjpeg)/i.test(k))];
  if (typeof factory !== "function") throw new Error("no module factory global found");
  const codec = await factory();
  delete globalThis.Module;

  const fixture = new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer());
  const decoder = new codec[decoderClass]();
  decoder.getEncodedBuffer(fixture.length).set(fixture);
  decoder.decode();
  const decoded = decoder.getDecodedBuffer();
  // hash the underlying bytes regardless of the view's element type
  const bytes = new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength).slice();
  decoder.delete();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch();
  const results = [];

  for (const [pkg, dist, decoderClass, fixture, raw] of VARIANTS) {
    const distFile = path.join(repoRoot, "packages", pkg, "dist", dist);
    if (!fs.existsSync(distFile)) {
      results.push([`${pkg}/${dist}`, "SKIP (dist not built)"]);
      if (process.env.CI) results.push([`${pkg}/${dist}`, "FAIL: dist missing in CI"]);
      continue;
    }
    const expected = crypto.createHash("sha256").update(fs.readFileSync(path.join(repoRoot, "packages", raw))).digest("hex");
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    try {
      await page.goto(`http://127.0.0.1:${port}/tools/browser-smoke/blank.html`);
      const actual = await page.evaluate(PAGE_FN, {
        distUrl: `http://127.0.0.1:${port}/packages/${pkg}/dist/${dist}`,
        decoderClass,
        fixtureUrl: `http://127.0.0.1:${port}/packages/${fixture}`,
      });
      results.push([`${pkg}/${dist}`, actual === expected ? "PASS" : `FAIL: hash mismatch (${actual.slice(0, 12)}… != ${expected.slice(0, 12)}…)`]);
    } catch (e) {
      results.push([`${pkg}/${dist}`, `FAIL: ${e.message}${pageErrors.length ? " | page: " + pageErrors.join("; ") : ""}`]);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();

  const width = Math.max(...results.map(([n]) => n.length));
  for (const [name, r] of results) console.log(name.padEnd(width + 2) + r);
  const failures = results.filter(([, r]) => r.startsWith("FAIL")).length;
  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} browser decode failure(s)`);
  process.exit(failures ? 1 : 0);
})();
