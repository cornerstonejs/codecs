#!/usr/bin/env node
//
// Emit the workspace's publishable packages in dependency order, one per line:
//
//   <name> <version> <dir>
//
// The release workflow consumes this instead of globbing packages/*/package.json
// itself, for three reasons:
//
//   1. ORDER. Alphabetically, dicom-codec sorts third — ahead of four of the six
//      siblings it depends on. Publishing it there leaves a window in which
//      `npm i @cornerstonejs/dicom-codec@latest` resolves ranges that do not
//      exist yet. `lerna publish` batched topologically; this restores that.
//
//   2. CONTENT. A package whose "files" ships dist/ must not be published with
//      an empty or missing dist/. The release gates on the vitest workspace,
//      but libjpeg-turbo-12bit has no vitest config, so nothing else would
//      notice a dropped build artifact before it reached npm.
//
//   3. SHELL SAFETY. Reading name/version out of each manifest in bash meant a
//      `read` per file, and `read` returns non-zero at EOF — under `set -e`
//      that killed the loop at the first private manifest, skipping every
//      package after it. One stream of complete lines has no such edge.
//
// Usage:
//   node tools/release/publish-order.mjs      (or: npm run release:order)
//
// Also imported by publish.mjs, which needs the same order and the same dist
// check but drives the publishing itself. The CLI behaviour below runs only
// when this file is executed directly, so importing it has no side effects.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

function readWorkspace() {
  const packages = new Map();

  for (const dir of fs.readdirSync(PACKAGES_DIR).sort()) {
    const manifestPath = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.private || !manifest.name || !manifest.version) {
      continue;
    }

    packages.set(manifest.name, { name: manifest.name, version: manifest.version, dir, manifest });
  }

  return packages;
}

/**
 * Depth-first topological sort: a package is emitted only after every
 * workspace sibling it depends on. Ties keep alphabetical order so the output
 * is stable run to run.
 */
function topologicallySorted(packages) {
  const sorted = [];
  const state = new Map(); // name -> 'visiting' | 'done'

  function visit(pkg, trail) {
    const seen = state.get(pkg.name);
    if (seen === 'done') {
      return;
    }
    if (seen === 'visiting') {
      throw new Error(`Dependency cycle in the workspace: ${[...trail, pkg.name].join(' -> ')}`);
    }

    state.set(pkg.name, 'visiting');

    const deps = DEP_FIELDS.flatMap((field) => Object.keys(pkg.manifest[field] ?? {}))
      .filter((dep) => packages.has(dep))
      .sort();

    for (const dep of deps) {
      visit(packages.get(dep), [...trail, pkg.name]);
    }

    state.set(pkg.name, 'done');
    sorted.push(pkg);
  }

  for (const pkg of packages.values()) {
    visit(pkg, []);
  }

  return sorted;
}

/**
 * Refuse to publish a package that says it ships dist/ but has nothing there.
 * `npm publish` would happily upload the manifest and README alone.
 */
function assertShippableContents(pkg) {
  const shipsDist =
    (pkg.manifest.files ?? []).includes('dist') || `${pkg.manifest.main ?? ''}`.startsWith('dist/');

  if (!shipsDist) {
    return;
  }

  const distDir = path.join(PACKAGES_DIR, pkg.dir, 'dist');
  const contents = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];

  if (contents.length === 0) {
    throw new Error(
      `${pkg.name} ships dist/ but packages/${pkg.dir}/dist is empty or missing. ` +
        `Refusing to publish an empty package — check that the build job produced ` +
        `the dist-${pkg.dir} artifact and that it was downloaded.`
    );
  }
}

/**
 * The workspace's publishable packages, in dependency order, each verified to
 * have the dist/ it claims to ship. Throws on a cycle or an empty dist.
 */
export function publishOrder() {
  const ordered = topologicallySorted(readWorkspace());

  for (const pkg of ordered) {
    assertShippableContents(pkg);
  }

  return ordered;
}

/** The `<name> <version> <dir>` lines the workflow's publish-order.txt holds. */
export function formatOrder(ordered) {
  return `${ordered.map((p) => `${p.name} ${p.version} ${p.dir}`).join('\n')}\n`;
}

function main() {
  process.stdout.write(formatOrder(publishOrder()));
}

// Executed directly, not imported.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
