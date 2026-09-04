#!/usr/bin/env node
//
// Publishes the workspace to npm, in dependency order, skipping versions that
// are already on the registry.
//
// This replaces the inline bash loop that used to live in release.yml's publish
// step. The reason it moved is the 2026-09-01 release: `@cornerstonejs/codec-libjxl`
// was a brand-new package, and npm's OIDC trusted publishing CANNOT create a
// package that does not exist yet -- a trusted publisher is configured per
// package, on the registry, so there is nothing to configure until the first
// version is there (npm/cli#8544). `npm publish` therefore failed with
// ENEEDAUTH, and because the loop ran under `set -euo pipefail` the step died on
// the spot -- stranding little-endian, openjpeg, openjph and dicom-codec, four
// packages that were already registered and would have published fine. Every
// release for the next three days failed the same way, each one leaving main
// tagged for versions that were not on npm.
//
// So the fix is not "keep going on error" -- publishing dicom-codec when a
// sibling whose range it carries has just failed is exactly the window
// publish-order.mjs exists to close. The fix is to ask the question BEFORE
// publishing anything: is every package we are about to publish actually
// publishable? A package that npm cannot accept is knowable up front, and a
// release that cannot fully succeed should decline to half-succeed.
//
// Usage:
//   node tools/release/publish.mjs                 (npm run release:publish)
//   node tools/release/publish.mjs --preflight     (npm run release:preflight)
//   node tools/release/publish.mjs --out FILE      also write the publish order
//
// --preflight checks and reports without publishing, and treats a
// needs-bootstrap package as a WARNING rather than an error: on a pull request
// the package legitimately does not exist yet, and failing the PR that adds a
// codec would be wrong. Without it, needs-bootstrap is fatal and nothing is
// published.
//
// NODE BUILTINS ONLY, and it must stay that way. release.yml's publish job
// installs no dependencies on purpose, so that the only code running next to a
// credential which can publish to npm is npm itself and the dependency-free
// scripts in this directory. An import from node_modules here would quietly
// undo that boundary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishOrder, formatOrder } from './publish-order.mjs';
import { runNpm, resolvesOnRegistry } from './npm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

/**
 * What npm will let us do with this package, in one of three states:
 *
 *   published       this exact version is already on the registry -> skip it
 *   publishable     the package exists, this version does not -> publish it
 *   needs-bootstrap the package NAME is not on the registry at all
 *
 * The third is the one that broke the release. `npm view` reports a missing
 * version and a missing package the same way (E404), so the two lookups have
 * to be separate to tell them apart.
 */
function registryState(pkg) {
  if (resolvesOnRegistry(`${pkg.name}@${pkg.version}`)) {
    return 'published';
  }

  return resolvesOnRegistry(pkg.name) ? 'publishable' : 'needs-bootstrap';
}

function bootstrapInstructions(packages) {
  const lines = [
    `${packages.length} package(s) have never been published, and npm's OIDC trusted`,
    'publishing cannot create a package that does not exist yet -- the trusted publisher is',
    'configured per package on the registry, so the first version has to come from a human.',
    'Nothing was published; the release declined rather than publishing a partial set.',
    '',
    'A maintainer with publish rights on @cornerstonejs and 2FA enabled should run, once:',
    '',
  ];

  for (const pkg of packages) {
    lines.push(`  cd packages/${pkg.dir} && npm publish --ignore-scripts && cd -`);
  }

  lines.push(
    '',
    '  npm run release:trust      # registers release.yml as the trusted publisher',
    '',
    'then re-run this workflow. See tools/release/README.md, "Adding a new package".'
  );

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const preflightOnly = args.includes('--preflight');
  const outIndex = args.indexOf('--out');
  const outFile = outIndex === -1 ? null : args[outIndex + 1];

  // Throws on a dependency cycle, or on a package that says it ships dist/ but
  // has an empty one -- both before any network call or any publish.
  const ordered = publishOrder();

  if (outFile) {
    fs.writeFileSync(outFile, formatOrder(ordered));
  }

  console.log(`Publish order (${ordered.length} packages):`);
  for (const pkg of ordered) {
    console.log(`  ${pkg.name} ${pkg.version} (${pkg.dir})`);
  }
  console.log('');

  // PREFLIGHT: resolve every package's state before touching the registry with
  // a write. This is the whole point of the file -- see the header.
  const state = new Map();
  for (const pkg of ordered) {
    state.set(pkg.name, registryState(pkg));
  }

  const needsBootstrap = ordered.filter((p) => state.get(p.name) === 'needs-bootstrap');

  if (needsBootstrap.length > 0) {
    const message = bootstrapInstructions(needsBootstrap);

    if (!preflightOnly) {
      console.error(`::error::${message}`);
      process.exit(1);
    }

    // Advisory on a PR: the package really does not exist yet, and the PR that
    // adds a codec should not fail for it. It should say so loudly, though --
    // silence here is what let libjxl reach main and break four releases.
    console.log(`::warning::${message}`);
  }

  const toPublish = ordered.filter((p) => state.get(p.name) === 'publishable');
  const alreadyOn = ordered.filter((p) => state.get(p.name) === 'published');

  for (const pkg of alreadyOn) {
    console.log(`${pkg.name}@${pkg.version} is already on npm; skipping.`);
  }

  if (preflightOnly) {
    console.log('');
    console.log(
      `Preflight: ${toPublish.length} to publish, ${alreadyOn.length} already on npm, ` +
        `${needsBootstrap.length} awaiting a first manual publish.`
    );
    return;
  }

  // Fail-fast, deliberately. If a publish fails here it is not a case we
  // predicted, and continuing would publish dicom-codec over ranges pointing at
  // a sibling that did not make it.
  for (const pkg of toPublish) {
    console.log(`Publishing ${pkg.name}@${pkg.version}`);
    // --ignore-scripts: prepublishOnly re-runs the emscripten build, and the
    // publish job has no toolchain. The dist here is the build job's artifact.
    const result = runNpm(['publish', '--ignore-scripts'], {
      cwd: path.join(PACKAGES_DIR, pkg.dir),
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      throw new Error(`npm publish failed for ${pkg.name}@${pkg.version} (exit ${result.status})`);
    }
  }

  console.log(
    `::notice::Published ${toPublish.length} package(s); ${alreadyOn.length} already on npm.`
  );
}

try {
  main();
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(1);
}
