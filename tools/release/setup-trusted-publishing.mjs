#!/usr/bin/env node
//
// One-time setup: register .github/workflows/release.yml as the npm trusted
// publisher for every package in this workspace.
//
// After this runs, the release workflow authenticates to npm with a short-lived
// OIDC token minted per run and scoped to that workflow -- no NPM_TOKEN, and a
// leaked token from anywhere else cannot publish these packages.
//
// Usage:
//   npm run release:trust
//   REPO=owner/name WORKFLOW=release.yml npm run release:trust
//
// PREREQUISITES
//   1. npm >= 11.15.0. The simplest way to get it is Node 24.20.0, which
//      bundles npm 11.19.0 -- the same pin release.yml uses. `npm install
//      --global npm@latest` will refuse on an older Node (npm 12 wants
//      ^22.22.2 || ^24.15.0 || >=26.0.0).
//   2. Logged in interactively:   npm login
//      The account needs publish rights on @cornerstonejs and must have 2FA
//      enabled. `npm trust` talks to an endpoint that only accepts a web-login
//      SESSION token: a granular or classic access token sitting in ~/.npmrc
//      fails with `401 ... Bearer token authorization is required`, even though
//      the same token publishes fine. That is why this cannot run unattended.
//      If you hit that 401, clear the stored token and log in again:
//          npm logout                 # or delete the //registry.npmjs.org/:_authToken
//          npm login                  #   line from ~/.npmrc by hand if logout fails
//      Note this replaces whatever token was in ~/.npmrc.
//
// Re-running is safe: npm allows exactly one publisher config per package, so a
// package that already has one is reported and skipped rather than duplicated.
// To replace an existing config, revoke it first:
//   npm trust list <package>
//   npm trust revoke <package> --id <id>
//
// A package that is not yet ON the registry cannot be configured at all -- see
// "Adding a new package" in README.md. Such packages are reported and skipped
// here rather than failing the run, since the fix is a manual publish.
//
// WHY THIS IS NODE AND NOT BASH. It used to be setup-trusted-publishing.sh,
// which computed the repo root with `cd ... && pwd` and passed it as argv to
// node. Under Cygwin `pwd` yields /cygdrive/z/src/codecs, and a *Windows*
// node.exe resolves that leading slash against the current drive -- so the
// scan died with `ENOENT: scandir 'Z:\cygdrive\z\src\codecs\packages'`. There
// is no path handed across a shell boundary here, and npm is spawned via its
// platform-correct executable name, so this runs the same from cmd,
// PowerShell, Git Bash, Cygwin and CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpm, npmVersion, resolvesOnRegistry } from './npm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

const REPO = process.env.REPO || 'cornerstonejs/codecs';
const WORKFLOW = process.env.WORKFLOW || 'release.yml';
const REQUIRED_NPM = '11.15.0';

/** -1 / 0 / 1, on dotted numeric versions. Avoids a semver dependency. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }

  return 0;
}

function requireNpmVersion() {
  const current = npmVersion();

  if (compareVersions(current, REQUIRED_NPM) < 0) {
    console.error(`npm ${current} is too old for \`npm trust\` (need >= ${REQUIRED_NPM}).`);
    console.error('Install Node 24.20.0, which bundles npm 11.19.0:');
    console.error('  https://nodejs.org/dist/v24.20.0/node-v24.20.0-x64.msi');
    process.exit(1);
  }

  return current;
}

/**
 * Every publishable package in the workspace.
 *
 * Read from the workspace rather than hardcoded, so the list cannot drift. A
 * package added or renamed without a trusted publisher of its own does not
 * fail here -- it fails at `npm publish`, partway through a live release.
 */
function publishablePackages() {
  const packages = [];

  for (const entry of fs.readdirSync(PACKAGES_DIR).sort()) {
    const manifestPath = path.join(PACKAGES_DIR, entry, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.private || !manifest.name) {
      continue;
    }

    packages.push(manifest.name);
  }

  return packages;
}

function main() {
  const npmCurrent = requireNpmVersion();
  const packages = publishablePackages();

  if (packages.length === 0) {
    console.error(`No publishable packages found under ${PACKAGES_DIR}.`);
    process.exit(1);
  }

  console.log(`npm ${npmCurrent}`);
  console.log(
    `Registering ${REPO} / ${WORKFLOW} as trusted publisher for ${packages.length} packages.`
  );
  console.log('The first package will prompt for your 2FA one-time password.');
  console.log('');

  const failed = [];
  const unpublished = [];

  for (const name of packages) {
    console.log(`==> ${name}`);

    if (!resolvesOnRegistry(name)) {
      console.log('    NOT ON NPM YET — skipping (needs a first manual publish; see README.md)');
      unpublished.push(name);
      console.log('');
      continue;
    }

    // stdio: inherit so npm's 2FA prompt reaches the terminal.
    const result = runNpm(
      ['trust', 'github', name, '--repo', REPO, '--file', WORKFLOW, '--allow-publish', '--yes'],
      { stdio: 'inherit' }
    );

    if (result.status === 0) {
      console.log('    ok');
    } else {
      console.error('    FAILED — see the message above (an existing config must be revoked first)');
      failed.push(name);
    }

    console.log('');
  }

  console.log('Current configuration:');
  for (const name of packages) {
    console.log(`==> ${name}`);
    // A package with no config exits non-zero; that is reported above, and is
    // not worth failing this summary over.
    runNpm(['trust', 'list', name], { stdio: 'inherit' });
  }

  if (unpublished.length > 0) {
    console.log('');
    console.log(`${unpublished.length} package(s) are not on npm yet: ${unpublished.join(', ')}`);
    console.log('Publish each once by hand, then re-run this script. See README.md.');
  }

  if (failed.length > 0) {
    console.error('');
    console.error(`${failed.length} package(s) were not configured: ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('Done. Next steps:');
  console.log('  - Merge the release workflow and watch the first run publish with provenance.');
  console.log("  - Then, on npmjs.com, set each package's Publishing access to");
  console.log("    'Require two-factor authentication and disallow tokens'.");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
