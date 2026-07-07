#!/usr/bin/env node
// Dist-size regression gate.
//
// Compares the built dist artifacts (packages/*/dist) against the committed
// ground truth in baseline.json and fails when any shipped file grows past
// tolerance, so a PR cannot regress binary size unintentionally.
//
// Usage:
//   node tools/dist-size/check.js               # check against baseline.json
//   node tools/dist-size/check.js --update      # rewrite baseline.json from
//                                               # the current dists
//   node tools/dist-size/check.js --artifacts <dir>
//       read dists from <dir>/dist-<package>/ (the layout produced by
//       `gh run download`) instead of packages/*/dist
//
// Tracked files: *.js, *.wasm, *.js.mem — the payloads users actually
// download. Source maps and publish receipts are ignored.
//
// Both raw and gzip (level 9) sizes are tracked: gzip is what network
// delivery actually costs, and raw is what memory/parse time costs.
//
// Tolerance: a file may grow by at most max(1%, 1024 bytes) in either
// measure. Intentional size changes must update the baseline in the same
// PR (run with --update and commit the diff) so growth is always visible
// in review.
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const repoRoot = path.resolve(__dirname, "../..");
const baselinePath = path.join(__dirname, "baseline.json");

const TRACKED = /\.(js|wasm|mem)$/;
const PCT_TOLERANCE = 0.01;
const ABS_TOLERANCE = 1024;

const args = process.argv.slice(2);
const update = args.includes("--update");
const artIdx = args.indexOf("--artifacts");
const artifactsDir = artIdx >= 0 ? path.resolve(args[artIdx + 1]) : null;

function collectDists() {
  const sizes = {};
  const packagesDir = path.join(repoRoot, "packages");
  const entries = artifactsDir
    ? fs
        .readdirSync(artifactsDir)
        .filter((d) => d.startsWith("dist-"))
        .map((d) => ({ pkg: d.slice(5), dir: path.join(artifactsDir, d) }))
    : fs
        .readdirSync(packagesDir)
        .map((p) => ({ pkg: p, dir: path.join(packagesDir, p, "dist") }));

  for (const { pkg, dir } of entries) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => TRACKED.test(f)).sort();
    if (!files.length) continue;
    sizes[pkg] = {};
    for (const f of files) {
      const buf = fs.readFileSync(path.join(dir, f));
      sizes[pkg][f] = {
        raw: buf.length,
        gzip: zlib.gzipSync(buf, { level: 9 }).length,
      };
    }
  }
  return sizes;
}

const kib = (n) => (n / 1024).toFixed(1) + " KiB";
const pct = (now, base) => (((now - base) / base) * 100).toFixed(2) + "%";

const current = collectDists();

if (update) {
  fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
  console.log(`baseline.json updated (${Object.keys(current).length} packages)`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error("baseline.json missing — run with --update to create it");
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

let failures = 0;
const report = [];

for (const [pkg, files] of Object.entries(baseline)) {
  if (!current[pkg]) {
    report.push(`FAIL ${pkg}: no dist built (baseline expects ${Object.keys(files).length} files)`);
    failures++;
    continue;
  }
  for (const [file, base] of Object.entries(files)) {
    const now = current[pkg][file];
    if (!now) {
      report.push(`FAIL ${pkg}/${file}: missing from build (in baseline: ${kib(base.raw)})`);
      failures++;
      continue;
    }
    for (const measure of ["raw", "gzip"]) {
      const allowed = base[measure] + Math.max(base[measure] * PCT_TOLERANCE, ABS_TOLERANCE);
      const delta = now[measure] - base[measure];
      const line = `${pkg}/${file} [${measure}] ${kib(base[measure])} -> ${kib(now[measure])} (${delta >= 0 ? "+" : ""}${pct(now[measure], base[measure])})`;
      if (now[measure] > allowed) {
        report.push(`FAIL ${line} — exceeds tolerance. If intentional, run 'node tools/dist-size/check.js --update' after a CI-equivalent build and commit baseline.json.`);
        failures++;
      } else if (delta !== 0) {
        report.push(`  ok ${line}`);
      }
    }
  }
  for (const file of Object.keys(current[pkg])) {
    if (!files[file]) {
      report.push(`FAIL ${pkg}/${file}: new artifact not in baseline (${kib(current[pkg][file].raw)}) — add it via --update so the addition is deliberate`);
      failures++;
    }
  }
}
for (const pkg of Object.keys(current)) {
  if (!baseline[pkg]) {
    report.push(`FAIL ${pkg}: package has dist artifacts but no baseline entry — add via --update`);
    failures++;
  }
}

console.log(report.length ? report.join("\n") : "all tracked artifacts byte-identical to baseline");
console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} size regression(s)`);
process.exit(failures ? 1 : 0);
