#!/usr/bin/env bash
#
# One-time setup: register .github/workflows/release.yml as the npm trusted
# publisher for every package in this workspace.
#
# After this runs, the release workflow authenticates to npm with a short-lived
# OIDC token minted per run and scoped to that workflow — no NPM_TOKEN, and a
# leaked token from anywhere else cannot publish these packages.
#
# PREREQUISITES
#   1. npm >= 11.15.0:            npm install --global npm@latest
#   2. Logged in interactively:   npm login
#      The account needs publish rights on @cornerstonejs and must have 2FA
#      enabled. `npm trust` talks to an endpoint that only accepts a web-login
#      SESSION token: a granular or classic access token sitting in ~/.npmrc
#      fails with `401 ... Bearer token authorization is required`, even though
#      the same token publishes fine. That is why this cannot run unattended.
#      If you hit that 401, clear the stored token and log in again:
#          npm logout                 # or delete the //registry.npmjs.org/:_authToken
#          npm login                  #   line from ~/.npmrc by hand if logout fails
#      Note this replaces whatever token was in ~/.npmrc.
#
# Re-running is safe: npm allows exactly one publisher config per package, so a
# package that already has one is reported and skipped rather than duplicated.
# To replace an existing config, revoke it first:
#   npm trust list <package>
#   npm trust revoke <package> --id <id>

set -euo pipefail

REPO="${REPO:-cornerstonejs/codecs}"
WORKFLOW="${WORKFLOW:-release.yml}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Read from the workspace rather than hardcoded, so the list cannot drift. A
# package added or renamed without a trusted publisher of its own does not fail
# here — it fails at `npm publish`, partway through a live release, after the
# version commit and tags have already landed on main.
#
# node rather than jq: npm is a prerequisite of this script, so node is
# guaranteed present and jq is not.
mapfile -t PACKAGES < <(
  node -e '
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(process.argv[1], "packages");

    for (const entry of fs.readdirSync(dir).sort()) {
      const manifest = path.join(dir, entry, "package.json");
      if (!fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (pkg.private || !pkg.name) continue;
      console.log(pkg.name);
    }
  ' "$ROOT"
)

if [ ${#PACKAGES[@]} -eq 0 ]; then
  echo "No publishable packages found under $ROOT/packages." >&2
  exit 1
fi

require_npm_version() {
  local current required="11.15.0"
  current=$(npm --version)

  # Sort the two versions and check the required one comes first.
  if [ "$(printf '%s\n%s\n' "$required" "$current" | sort -V | head -n1)" != "$required" ]; then
    echo "npm $current is too old for \`npm trust\` (need >= $required)." >&2
    echo "Run: npm install --global npm@latest" >&2
    exit 1
  fi
}

require_npm_version

echo "Registering $REPO / $WORKFLOW as trusted publisher for ${#PACKAGES[@]} packages."
echo "The first package will prompt for your 2FA one-time password."
echo

failed=()
for pkg in "${PACKAGES[@]}"; do
  echo "==> $pkg"
  if npm trust github "$pkg" \
    --repo "$REPO" \
    --file "$WORKFLOW" \
    --allow-publish \
    --yes; then
    echo "    ok"
  else
    echo "    FAILED — see the message above (an existing config must be revoked first)" >&2
    failed+=("$pkg")
  fi
  echo
done

echo "Current configuration:"
for pkg in "${PACKAGES[@]}"; do
  echo "==> $pkg"
  npm trust list "$pkg" || true
done

if [ ${#failed[@]} -gt 0 ]; then
  echo >&2
  echo "${#failed[@]} package(s) were not configured: ${failed[*]}" >&2
  exit 1
fi

echo
echo "Done. Next steps:"
echo "  - Merge the release workflow and watch the first run publish with provenance."
echo "  - Then, on npmjs.com, set each package's Publishing access to"
echo "    'Require two-factor authentication and disallow tokens', and delete"
echo "    the old NPM_TOKEN from the CircleCI project."
