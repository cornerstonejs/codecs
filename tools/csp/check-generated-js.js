#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const distDirectory = path.resolve(process.argv[2] ?? "");

if (!process.argv[2] || !fs.existsSync(distDirectory)) {
  console.error("Usage: node tools/csp/check-generated-js.js <dist-directory>");
  process.exit(1);
}

const javascriptFiles = fs
  .readdirSync(distDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .sort();

if (javascriptFiles.length === 0) {
  console.error(`No generated JavaScript found in ${distDirectory}`);
  process.exit(1);
}

const forbiddenDynamicCode = [
  ["eval()", /\beval\s*\(/],
  ["new Function()", /\bnew\s+Function\s*\(/],
  ["Emscripten Function constructor", /\bnewFunc\s*\(\s*Function\s*,/],
];

const violations = [];

for (const fileName of javascriptFiles) {
  const source = fs.readFileSync(path.join(distDirectory, fileName), "utf8");

  for (const [description, pattern] of forbiddenDynamicCode) {
    if (pattern.test(source)) {
      violations.push(`${fileName}: ${description}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Generated codec JavaScript contains CSP-unsafe dynamic code:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log(`CSP-safe generated JavaScript: ${javascriptFiles.length} file(s) checked`);
