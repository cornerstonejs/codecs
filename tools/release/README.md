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

1. Builds every package's `dist` in the emscripten container (matrix job).
2. Runs the vitest workspace against those exact dists. A failure here stops the release before
   anything is committed, tagged or published.
3. Runs `version.mjs`, then commits `chore(release): publish [skip ci]` and one annotated tag per
   released package, and pushes both to `main` with `GITHUB_TOKEN`.
4. Publishes each package with `npm publish --ignore-scripts` from the built tree. `--ignore-scripts`
   is deliberate: `prepublishOnly` re-runs `bash build.sh`, and the publish job has no emscripten
   toolchain — the dist being published is the artifact built in step 1 from the same commit.
5. Creates a GitHub Release per tag. This happens inline rather than in a tag-triggered workflow
   because GitHub suppresses workflow runs for pushes made with `GITHUB_TOKEN`.

Every step is idempotent. If a run dies partway through publishing, re-run the workflow from the
Actions tab (`workflow_dispatch`) and it finishes the job rather than double-publishing: `version.mjs`
correctly finds nothing new to version (the commit and tags already landed), and steps 4 and 5 work
from "every package whose current version is not yet on npm / has no release yet" rather than from
that run's plan.

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
