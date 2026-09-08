#!/usr/bin/env node
"use strict";

// CSP gate for HAND-WRITTEN source, the companion to check-generated-js.js.
//
// That script checks emscripten's output, and each wasm package's build.sh
// runs it on its own dist/. Nothing checked the source we write, and the gap
// was not theoretical: dicom-codec's JPEG XL wrapper reached `fs` by
// evaluating the string "require", and since dicom-codec's `main` is
// src/index.js, consumers bundle that source straight into a browser build.
// A strict CSP forbids the call site whether or not the guard around it ever
// lets it run.
//
// Scope is packages/<pkg>/src: the code that is published or bundled. Tests
// and benches are deliberately out of scope — they never reach a browser, and
// tools/csp's own fixtures have to contain the very tokens this forbids.
//
// Usage:
//   node tools/csp/check-source-js.js [packages-directory]
//
// Defaults to the packages/ directory of this repo, so CI and a bare local
// run check the same thing.

const fs = require("fs");
const path = require("path");

const { findViolations } = require("./forbidden-dynamic-code");

const packagesDirectory = path.resolve(
  process.argv[2] ?? path.join(__dirname, "../../packages")
);

if (!fs.existsSync(packagesDirectory)) {
  console.error(`No packages directory at ${packagesDirectory}`);
  process.exit(1);
}

const SOURCE_FILE = /\.(?:js|mjs|cjs)$/;

/** Every JS file under `directory`, recursively. */
function sourceFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(fullPath));
    } else if (SOURCE_FILE.test(entry.name)) {
      found.push(fullPath);
    }
  }
  return found;
}

const violations = [];
let checked = 0;

for (const entry of fs.readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  // src/ only. The wasm packages keep C++ in there, so most contribute
  // nothing; big-endian, little-endian and dicom-codec are the JS ones.
  const sourceDirectory = path.join(packagesDirectory, entry.name, "src");
  if (!fs.existsSync(sourceDirectory)) continue;

  for (const file of sourceFiles(sourceDirectory)) {
    checked += 1;
    const source = fs.readFileSync(file, "utf8");
    for (const description of findViolations(source)) {
      violations.push(`${path.relative(packagesDirectory, file)}: ${description}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Hand-written codec source contains CSP-unsafe dynamic code:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  console.error(
    "\nA strict Content-Security-Policy blocks these at the call site, and " +
      "consumers bundle this source. Reach node builtins with " +
      "process.getBuiltinModule() rather than an evaluated require."
  );
  process.exit(1);
}

console.log(`CSP-safe source: ${checked} file(s) checked`);
