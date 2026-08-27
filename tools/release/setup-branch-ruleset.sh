#!/usr/bin/env bash
#
# One-time setup: move main's protection from classic branch protection to a
# repository ruleset that lists an ORG-OWNED GitHub App as a bypass actor, so
# the release workflow can push the version commit and tags.
#
# MUST BE RUN BY AN ORGANIZATION OWNER. Repo admin is not enough: creating the
# App and installing it on the repo are org-level actions. See STEP 1 below.
#
# WHY
#   The release workflow pushes the `chore(release): publish` commit and the
#   per-package tags. Classic branch protection has no bypass list — only repo
#   admins skip the pull-request requirement — which is why the CircleCI release
#   had to push with a maintainer's personal SSH key. Rulesets do support bypass
#   actors, so migrating lets CI push with no personal credential anywhere.
#
#   A ruleset cannot relax classic protection: when both exist GitHub applies
#   the most restrictive of the two. The classic rule must therefore be deleted,
#   which is why this script does both halves.
#
# WHY NOT THE BUILT-IN GITHUB_TOKEN
#   An earlier version of this script used the "GitHub Actions" app (id 15368)
#   as the bypass actor. That cannot work, and GitHub rejects it outright:
#
#     HTTP 422: Actor GitHub Actions integration must be part of the ruleset
#               source or owner organization
#
#   App 15368 is owned by `github`, not by this organization, and a ruleset only
#   accepts bypass actors belonging to the repo or its owning org. There is no
#   repository setting that grants the built-in GITHUB_TOKEN a push to a
#   PR-protected branch. An org-owned App is the supported route, and unlike a
#   PAT it is not tied to any individual's account or expiry.
#
# WHAT CHANGES FOR HUMANS
#   Nothing. The ruleset below reproduces main's current rules exactly:
#   1 approving review, code-owner review required, stale reviews dismissed on
#   push, last-push approval required, no force pushes, no branch deletion.
#
# ---------------------------------------------------------------------------
# STEP 1 — create the App and install it (org owner, GitHub UI, ~5 minutes)
#
#   1. https://github.com/organizations/cornerstonejs/settings/apps/new
#        GitHub App name:  cornerstonejs-release
#        Homepage URL:     https://github.com/cornerstonejs/codecs
#        Webhook:          UNCHECK "Active" — this App never receives events
#        Repository permissions:
#          Contents ......... Read and write   (push the commit + tags)
#          Metadata ......... Read-only        (added automatically)
#        Nothing else. Do NOT grant Actions, Packages, or Administration.
#        "Where can this GitHub App be installed?" -> Only on this account
#      Create, then note the App ID shown on the settings page.
#
#   2. Still on the App's page: "Private keys" -> "Generate a private key".
#      A .pem downloads. It is shown once.
#
#   3. "Install App" (left sidebar) -> Install on cornerstonejs ->
#      "Only select repositories" -> codecs -> Install.
#
#   4. Store the credentials on the repo (or the org, if you prefer to share
#      the App with other repos later):
#        gh variable set RELEASE_APP_ID --repo cornerstonejs/codecs --body '<App ID>'
#        gh secret   set RELEASE_APP_PRIVATE_KEY --repo cornerstonejs/codecs < /path/to/key.pem
#      Then delete the local .pem. release.yml reads exactly these two names.
#
# STEP 2 — run this script, which does the ruleset half:
#        gh auth login                       # as the org owner
#        gh auth refresh -s admin:org        # ruleset writes need this scope
#        RELEASE_APP_SLUG=cornerstonejs-release bash tools/release/setup-branch-ruleset.sh
#
# STEP 3 — verify:
#        gh api repos/cornerstonejs/codecs/rulesets
#        gh api repos/cornerstonejs/codecs/branches/main/protection   # expect 404
#      Then re-run the failed Release workflow. The push step logs a warning if
#      RELEASE_APP_ID is missing, so a misconfigured STEP 1 says so plainly
#      instead of failing with "protected branch hook declined".
# ---------------------------------------------------------------------------

set -euo pipefail

REPO="${REPO:-cornerstonejs/codecs}"
ORG="${REPO%%/*}"

# The App whose installation is allowed to bypass the pull-request rule. Must be
# owned by $ORG — see "WHY NOT THE BUILT-IN GITHUB_TOKEN" above. Pass the slug
# from the App's URL (github.com/organizations/<org>/settings/apps/<slug>),
# which is the name lowercased with spaces as hyphens.
RELEASE_APP_SLUG="${RELEASE_APP_SLUG:-cornerstonejs-release}"

# gh's built-in --jq, not standalone jq: this script is run from a maintainer's
# own machine, where jq is not a given (release.yml can assume it, a laptop
# cannot). One call, both fields, split below.
if ! APP_INFO=$(gh api "apps/$RELEASE_APP_SLUG" --jq '"\(.id) \(.owner.login)"' 2>/dev/null); then
  cat >&2 <<MSG
Could not find a GitHub App with slug '$RELEASE_APP_SLUG'.

Complete STEP 1 in this script's header first, then re-run with the slug:
  RELEASE_APP_SLUG=<slug> bash tools/release/setup-branch-ruleset.sh

The slug is the last path segment of the App's settings URL.
MSG
  exit 1
fi

read -r RELEASE_APP_ID RELEASE_APP_OWNER <<<"$APP_INFO"

# Fail here rather than let the API return the 422 this script exists to avoid.
if [ "$RELEASE_APP_OWNER" != "$ORG" ]; then
  cat >&2 <<MSG
App '$RELEASE_APP_SLUG' (id $RELEASE_APP_ID) is owned by '$RELEASE_APP_OWNER', not '$ORG'.

A repository ruleset only accepts bypass actors belonging to the repo or its
owning organization, so GitHub would reject this with:
  422 Actor ... must be part of the ruleset source or owner organization

Create the App under the $ORG organization (STEP 1) rather than under a personal
account.
MSG
  exit 1
fi

echo "Bypass actor: $RELEASE_APP_SLUG (App id $RELEASE_APP_ID, owned by $RELEASE_APP_OWNER)"
echo

# An App that is not installed on the repo yields a ruleset that looks correct
# and still cannot push. Warn rather than fail: listing installations needs
# admin:org, which the operator may deliberately not have granted this token.
if INSTALLS=$(gh api "orgs/$ORG/installations" --jq '.installations[].app_slug' 2>/dev/null); then
  if ! printf '%s\n' "$INSTALLS" | grep -qx "$RELEASE_APP_SLUG"; then
    echo "WARNING: '$RELEASE_APP_SLUG' is not installed on $ORG. Do STEP 1.3." >&2
    echo >&2
  fi
else
  echo "NOTE: could not list org installations (needs admin:org); skipping the" >&2
  echo "      install check. Confirm STEP 1.3 was done." >&2
  echo >&2
fi

echo "Current protection on $REPO main:"
gh api "repos/$REPO/branches/main/protection" || true
echo

read -r -p "Create the replacement ruleset and delete the classic protection? [y/N] " reply
case "$reply" in
  [yY]) ;;
  *) echo "Aborted."; exit 1 ;;
esac

echo "Creating ruleset..."
gh api -X POST "repos/$REPO/rulesets" --input - <<JSON
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "bypass_actors": [
    {
      "actor_id": $RELEASE_APP_ID,
      "actor_type": "Integration",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    }
  ]
}
JSON

echo
echo "Deleting classic branch protection..."
gh api -X DELETE "repos/$REPO/branches/main/protection"

echo
echo "Done. Resulting rulesets:"
gh api "repos/$REPO/rulesets"
