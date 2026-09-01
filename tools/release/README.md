# Releasing

Releases are fully automated: merge to `main`, and
[.github/workflows/release.yml](../../.github/workflows/release.yml) versions, tags, publishes and
writes the GitHub Releases. npm auth is OIDC trusted publishing, so there is no npm token to
rotate. Git auth for the one push to `main` is either a repo deploy key (`RELEASE_DEPLOY_KEY`) or an
org-owned GitHub App (`RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY`) — the built-in `GITHUB_TOKEN`
cannot push to a PR-protected branch and cannot be granted a ruleset bypass, since the app it
authenticates as is owned by `github` rather than by this org. See
[§2 below](#2-a-push-credential-for-main--the-branch-ruleset).

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
   `chore(release): publish` and one annotated tag per released package, and pushes to
   `main` with a token minted per-run from the release App. The token is passed to `git push` in the
   remote URL rather than persisted into `.git/config` by `actions/checkout`, so it is not sitting on
   disk while `pnpm install` runs. The job outputs the pushed commit SHA.

   The push is `--atomic`: without it a declined branch update still publishes the tags, which is how
   run [32733067241](https://github.com/cornerstonejs/codecs/actions/runs/32733067241) left eight
   version tags on a commit that never reached `main` and wedged every later release at
   `git tag -a` with "tag already exists".
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

### 2. A push credential for `main` + the branch ruleset

Two routes. **The deploy-key route needs only repo admin**; the App route is better hygiene but
requires an organization owner. `release.yml` accepts either and prefers the App when both exist.

| | Deploy key | GitHub App |
|---|---|---|
| Who can set it up | repo admin | **org owner** |
| Scope | write to the whole repo | `Contents: write` |
| Lifetime | no expiry | token expires hourly |
| Bypass granularity | **every** write-enabled deploy key on the repo | that one App |
| Secrets | `RELEASE_DEPLOY_KEY` | `RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY` |

Neither is a personal credential, which is the thing to preserve — the point of moving off
CircleCI's arrangement was that releases must not depend on one person's key.

The release job needs to push the version commit to `main`, which requires a pull request. The
built-in `GITHUB_TOKEN` cannot be exempted from that: the "GitHub Actions" app it authenticates as
(id 15368) is owned by `github`, and a ruleset only accepts bypass actors belonging to the repo or
its owning org, so GitHub rejects it with

```
422 Actor GitHub Actions integration must be part of the ruleset source or owner organization
```

A **deploy key** or an **org-owned App** can both be listed as bypass actors. A deploy key belongs to
the repository, so it satisfies "part of the ruleset source" with no ownership question — which is
why it works without org access.

#### Route A — deploy key (repo admin)

1. **Create the key and store both halves.** Full walkthrough is `STEP 1-DEPLOY-KEY` in
   [setup-branch-ruleset.sh](setup-branch-ruleset.sh)'s header. Summary:

   ```bash
   ssh-keygen -t ed25519 -N '' -C 'codecs release' -f ./codecs-release-key
   gh repo deploy-key add ./codecs-release-key.pub \
     --repo cornerstonejs/codecs --title 'codecs release' --allow-write
   gh secret set RELEASE_DEPLOY_KEY --repo cornerstonejs/codecs < ./codecs-release-key
   rm ./codecs-release-key ./codecs-release-key.pub
   ```

2. **Migrate the branch protection:**

   ```bash
   gh auth login          # as a repo admin
   bash tools/release/setup-branch-ruleset.sh
   ```

> [!WARNING]
> The `DeployKey` bypass actor takes `actor_id: null` — it is a **category, not a specific key**.
> Every write-enabled deploy key on the repo, present and future, can then push to `main` without
> review. The script lists them and makes you acknowledge the list by name before it creates
> anything. Audit before enabling, and delete any left over from retired CI — a key nobody uses stops
> being merely unused and becomes one that bypasses branch protection:
>
> ```bash
> gh repo deploy-key list --repo cornerstonejs/codecs
> gh repo deploy-key delete <id> --repo cornerstonejs/codecs
> ```
>
> The release key is the only write-enabled key that should appear. Anything else is a finding.

#### Route B — GitHub App (org owner)

1. **Create and install the App** — walkthrough is `STEP 1-APP` in the script's header. Summary:
   create `cornerstonejs-release` under the org with **Contents: read and write** and nothing else, no
   webhook, generate a private key, install it on `codecs` only, then

   ```bash
   gh variable set RELEASE_APP_ID --repo cornerstonejs/codecs --body '<App ID>'
   gh secret   set RELEASE_APP_PRIVATE_KEY --repo cornerstonejs/codecs < /path/to/key.pem
   rm /path/to/key.pem
   ```

2. **Migrate the branch protection:**

   ```bash
   gh auth login                     # as the org owner
   BYPASS=app RELEASE_APP_SLUG=cornerstonejs-release bash tools/release/setup-branch-ruleset.sh
   ```

#### Either route

The script replaces main's classic branch protection with an equivalent ruleset listing the chosen
bypass actor. Review requirements for humans are unchanged: 1 approving review, code-owner review,
stale reviews dismissed on push, last-push approval, no force pushes, no branch deletion. See the
script's header for why the classic rule has to go rather than sit alongside the ruleset.

One behavioural note that applies to both routes: GitHub suppresses workflow runs only for pushes
made with `GITHUB_TOKEN`. An App-token push and a deploy-key push are both ordinary pushes, so the
release's own version commit *does* retrigger the workflows on `main`.

What stops that being a loop is the guard on each workflow's root job:

```yaml
if: >-
  github.event_name != 'push'
  || !startsWith(github.event.head_commit.message, 'chore(release): publish')
```

So the release commit's **subject line is load-bearing**. `release.yml` writes it, and `release.yml`,
`pr-checks.yml` and `bench.yml` all match on it — change the wording in one place and you must change
it in all four.

This deliberately does not use `[skip ci]`. GitHub scans the entire head-commit message for that
keyword, body included, and a squash merge concatenates every commit message on the branch into the
body — so a PR that merely *mentions* `[skip ci]` in prose disables every workflow for its merge
commit, creating no run at all to notice. That is exactly what happened to
[#89](https://github.com/cornerstonejs/codecs/pull/89), whose commits explained why the release
commit carried the keyword. Anchoring on the subject cannot be tripped by prose.

3. **Verify**, then re-run the failed Release workflow:

   ```bash
   gh api repos/cornerstonejs/codecs/rulesets
   gh api repos/cornerstonejs/codecs/branches/main/protection   # expect 404
   ```

If `RELEASE_APP_ID` is unset the release still runs and fails at the push, but logs a warning naming
this section rather than only `protected branch hook declined`.
