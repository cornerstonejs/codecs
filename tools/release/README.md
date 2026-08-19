# Releasing

Releases are fully automated: merge to `main`, and
[.github/workflows/release.yml](../../.github/workflows/release.yml) versions, tags, publishes and
writes the GitHub Releases. There are no release secrets to rotate — npm auth is OIDC trusted
publishing and git auth is the built-in `GITHUB_TOKEN`.

## How a release is decided

`version.mjs` reproduces what `lerna version` used to do, minus lerna:

- Each package is versioned independently and tagged `@cornerstonejs/codec-foo@1.2.3`.
- A package's bump comes from the conventional commits touching `packages/<dir>/` since its own last
  tag: a breaking change (`feat!:` or a `BREAKING CHANGE:` body) is a major, any `feat:` is a minor,
  anything else is a patch. No commits, no release.
- Commits that touched *only* `*.md`, `*.yml`, `*.spec.js` or `*.test.js` do not count — the
  `ignoreChanges` list carried over from lerna.json. A docs pass releases nothing.
- Packages that depend on something being released get their caret range rewritten and a patch bump
  of their own, so `dicom-codec` always ships ranges that resolve to the codecs published alongside it.
- Each bump prepends a `CHANGELOG.md` entry in the same format as the existing history.

Preview what the next release would do, at any time, from a clean checkout with tags:

```bash
pnpm release:plan          # node tools/release/version.mjs --dry-run
node tools/release/version.mjs --dry-run --json   # machine-readable
```

`--dry-run` writes nothing. Without it the script rewrites manifests and changelogs and emits
`release-plan.json` (gitignored); the workflow is what commits, tags and pushes.

## What the workflow does

Four jobs, in order. The split is a permission boundary, not tidiness: GitHub scopes
`permissions:` to a whole job, never to a step, so every right a job asks for is held by all the
third-party code that runs in it — the `actions/*` it calls and any dependency install scripts.

| Job | Permissions | Installs deps? |
| --- | --- | --- |
| `build` | `contents: read` | yes |
| `release` | `contents: write` | yes |
| `publish` | `id-token: write` (+ `contents: read`) | **no** |
| `github-releases` | `contents: write` | **no** |

`pnpm install` therefore never runs in a job that can publish to npm, and the job holding the OIDC
token runs nothing but `npm`, the pinned actions and `publish-order.mjs` (node builtins only).

1. **`build`** — every package's `dist`, in the emscripten container (matrix job). Read-only, but its
   artifacts are what reaches npm, so its actions are SHA-pinned like the rest.
2. **`release`** — runs the vitest workspace against those exact dists (a failure here stops the
   release before anything is committed, tagged or published), then `version.mjs`, then regenerates
   `pnpm-lock.yaml` (pnpm records each importer's *specifier*, so rewriting dicom-codec's ranges
   strands the lockfile and the next `--frozen-lockfile` install fails), commits
   `chore(release): publish [skip ci]` and one annotated tag per released package, and pushes to
   `main` with `GITHUB_TOKEN`. The token is passed to `git push` in the remote URL rather than
   persisted into `.git/config` by `actions/checkout`, so it is not sitting on disk while `pnpm
   install` runs. The job outputs the pushed commit SHA.
3. **`publish`** — checks out that SHA, replays the dists, and publishes each package with
   `npm publish --ignore-scripts` in the dependency order `publish-order.mjs` computes — dicom-codec
   goes out after the six siblings whose ranges it carries. `--ignore-scripts` is deliberate:
   `prepublishOnly` re-runs `bash build.sh`, and this job has no emscripten toolchain — the dist
   being published is the artifact built in step 1 from the same commit. npm's version comes from
   the exactly-pinned `node-version` (v24.19.0 → npm 11.17.0, past the 11.5.1 OIDC floor), so there
   is no `npm install --global npm@latest` re-downloading an unpinned publisher every release.
4. **`github-releases`** — a GitHub Release per tag, from the package list `publish` uploaded. It is
   a separate job so `gh release create`'s `contents: write` never coexists with the OIDC publish
   token, and it happens here rather than in a tag-triggered workflow because GitHub suppresses
   workflow runs for pushes made with `GITHUB_TOKEN`.

`publish-order.mjs` also refuses to emit a package that claims to ship `dist/` but has an empty one,
which is the only thing standing between a dropped build artifact and an empty package on npm for
`libjpeg-turbo-12bit` (it has no vitest config, so the test gate never touches it).

Both scripts run on every PR as a dry-run step in `pr-checks.yml`, so they are not first executed
mid-release.

Every step is idempotent. If a run dies partway through publishing, re-run the workflow from the
Actions tab (`workflow_dispatch`) and it finishes the job rather than double-publishing: `version.mjs`
correctly finds nothing new to version (the commit and tags already landed) and the `release` job
falls back to reporting the triggering commit as the one to publish from, while `publish` and
`github-releases` work from "every package whose current version is not yet on npm / has no release
yet" rather than from that run's plan.

## One-time setup

Both scripts are run by a human, once, and need credentials no CI job has.

### 1. npm trusted publishing

```bash
npm install --global npm@latest   # needs >= 11.15.0 for `npm trust`
npm login                         # account with publish rights on @cornerstonejs, 2FA enabled
bash tools/release/setup-trusted-publishing.sh
```

This registers `cornerstonejs/codecs` + `release.yml` as the trusted publisher for all eight
packages. The first call prompts for a 2FA one-time password.

**The workflow's filename is part of the trust relationship.** Renaming `release.yml` breaks every
publish until the script is re-run against the new name.

Trusted publishing also forces provenance generation, which requires each package's
`repository.url` to point at this repo — that is why every manifest carries a
`repository` block with a `directory`. A package whose `repository.url` drifts will fail to publish.

After the first green release, harden on npmjs.com: set each package's *Publishing access* to
"Require two-factor authentication and disallow tokens", and delete the old `NPM_TOKEN` from the
CircleCI project (CircleCI no longer runs anything for this repo — the project should be disabled).

### 2. `main` branch ruleset

```bash
gh auth login                     # as a repo admin
bash tools/release/setup-branch-ruleset.sh
```

Replaces main's classic branch protection with an equivalent ruleset that lets the GitHub Actions app
bypass the pull-request requirement, so the release job can push the version commit. Review
requirements for humans are unchanged. See the script's header for why the classic rule has to go
rather than sit alongside the ruleset.
