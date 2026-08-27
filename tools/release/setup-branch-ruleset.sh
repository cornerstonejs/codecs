#!/usr/bin/env bash
#
# One-time setup: move main's protection from classic branch protection to a
# repository ruleset with a bypass actor the release workflow can push as.
#
# TWO ROUTES. Pick by what access you have:
#
#   BYPASS=deploy-key   (default)  REPO ADMIN is enough.
#       A repo-scoped SSH deploy key with write access. Blunter than the App --
#       write to the whole repo, no expiry -- but it belongs to the repository
#       rather than to a person, and needs nobody above repo admin.
#
#   BYPASS=app                     Requires an ORGANIZATION OWNER.
#       An org-owned GitHub App. Better hygiene: scoped to Contents: write, the
#       token expires in an hour, and it is auditable as an app. Preferred if
#       you can get an owner to do STEP 1-APP.
#
# Both are recognised by release.yml, which prefers the App when both exist.
# Neither puts a personal credential in the pipeline, which is the thing the
# CircleCI setup (a maintainer's own SSH key) got wrong.
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
# STEP 1-DEPLOY-KEY — the repo-admin route (~3 minutes, no org access)
#
#   1. Generate a keypair. Nothing but this repo will ever use it, so it does
#      not belong in ~/.ssh:
#        ssh-keygen -t ed25519 -N '' -C 'codecs release' -f ./codecs-release-key
#
#   2. Add the PUBLIC half as a deploy key WITH WRITE ACCESS:
#        gh repo deploy-key add ./codecs-release-key.pub \
#          --repo cornerstonejs/codecs --title 'codecs release' --allow-write
#      (UI equivalent: Settings -> Deploy keys -> Add deploy key, tick
#      "Allow write access".)
#
#   3. Add the PRIVATE half as the secret release.yml reads, then delete both
#      local halves -- the repo and the secret are the only copies you need:
#        gh secret set RELEASE_DEPLOY_KEY --repo cornerstonejs/codecs < ./codecs-release-key
#        rm ./codecs-release-key ./codecs-release-key.pub
#
#   4. Run this script (default BYPASS=deploy-key), then STEP 3.
#        gh auth login          # as a repo admin
#        bash tools/release/setup-branch-ruleset.sh
#
# STEP 1-APP — the org-owner route (GitHub UI, ~5 minutes)
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
#   2. Run this script in app mode, then STEP 3:
#        gh auth login          # as the org owner
#        BYPASS=app RELEASE_APP_SLUG=cornerstonejs-release \
#          bash tools/release/setup-branch-ruleset.sh
#
# STEP 3 — verify, either route:
#        gh api repos/cornerstonejs/codecs/rulesets
#        gh api repos/cornerstonejs/codecs/branches/main/protection   # expect 404
#      Then re-run the failed Release workflow. Its push step logs which
#      credential it used, and warns if neither is configured, so a half-done
#      STEP 1 says so plainly instead of failing with "protected branch hook
#      declined".
# ---------------------------------------------------------------------------

set -euo pipefail

REPO="${REPO:-cornerstonejs/codecs}"
ORG="${REPO%%/*}"
BYPASS="${BYPASS:-deploy-key}"

case "$BYPASS" in
  deploy-key)
    # A deploy key belongs to the repository by definition, so it satisfies
    # "part of the ruleset source" with no id to resolve and no ownership
    # question -- which is exactly why this route needs nothing above repo
    # admin. actor_id MUST be null for this actor_type.
    BYPASS_ACTOR_JSON='{ "actor_id": null, "actor_type": "DeployKey", "bypass_mode": "always" }'
    echo "Bypass actor: EVERY write-enabled deploy key on $REPO"
    echo

    # Note the blast radius, which is the one real drawback of this route: the
    # DeployKey actor takes actor_id null, so it is a category, not a specific
    # key. There is no way to grant bypass to one deploy key and withhold it from
    # another. Every write-enabled key on the repo, present and future, can push
    # to main without review.
    #
    # So the write-enabled keys are listed here rather than merely counted, and
    # the operator is asked to look. A leftover key from a retired CI system is
    # the case that matters: it stops being an unused credential and becomes one
    # that bypasses branch protection.
    WRITE_KEYS=$(gh repo deploy-key list --repo "$REPO" 2>/dev/null | grep -F 'read-write' || true)
    if [ -z "$WRITE_KEYS" ]; then
      echo "WARNING: $REPO has no write-enabled deploy key, so the release still" >&2
      echo "         cannot push. Do STEP 1-DEPLOY-KEY 1-3." >&2
    else
      echo "Write-enabled deploy keys that this ruleset will let bypass review:"
      printf '%s\n' "$WRITE_KEYS" | sed 's/^/  /'
      echo
      echo "Delete any that are not the release key:"
      echo "  gh repo deploy-key delete <id> --repo $REPO"
    fi
    echo
    ;;

  app)
    # The App whose installation is allowed to bypass the pull-request rule. Must
    # be owned by $ORG — see "WHY NOT THE BUILT-IN GITHUB_TOKEN" above. Pass the
    # slug from the App's URL
    # (github.com/organizations/<org>/settings/apps/<slug>), which is the name
    # lowercased with spaces as hyphens.
    RELEASE_APP_SLUG="${RELEASE_APP_SLUG:-cornerstonejs-release}"

    # gh's built-in --jq, not standalone jq: this script is run from a
    # maintainer's own machine, where jq is not a given (release.yml can assume
    # it, a laptop cannot). One call, both fields, split below.
    if ! APP_INFO=$(gh api "apps/$RELEASE_APP_SLUG" --jq '"\(.id) \(.owner.login)"' 2>/dev/null); then
      cat >&2 <<MSG
Could not find a GitHub App with slug '$RELEASE_APP_SLUG'.

Complete STEP 1-APP in this script's header first, then re-run with the slug:
  BYPASS=app RELEASE_APP_SLUG=<slug> bash tools/release/setup-branch-ruleset.sh

The slug is the last path segment of the App's settings URL.
MSG
      exit 1
    fi

    read -r RELEASE_APP_ID RELEASE_APP_OWNER <<<"$APP_INFO"

    # Fail here rather than let the API return the 422 this script exists to
    # avoid.
    if [ "$RELEASE_APP_OWNER" != "$ORG" ]; then
      cat >&2 <<MSG
App '$RELEASE_APP_SLUG' (id $RELEASE_APP_ID) is owned by '$RELEASE_APP_OWNER', not '$ORG'.

A repository ruleset only accepts bypass actors belonging to the repo or its
owning organization, so GitHub would reject this with:
  422 Actor ... must be part of the ruleset source or owner organization

Create the App under the $ORG organization (STEP 1-APP) rather than under a
personal account. If you do not have organization owner access, use the
deploy-key route instead -- it needs only repo admin:
  bash tools/release/setup-branch-ruleset.sh
MSG
      exit 1
    fi

    BYPASS_ACTOR_JSON="{ \"actor_id\": $RELEASE_APP_ID, \"actor_type\": \"Integration\", \"bypass_mode\": \"always\" }"
    echo "Bypass actor: $RELEASE_APP_SLUG (App id $RELEASE_APP_ID, owned by $RELEASE_APP_OWNER)"

    # An App that is not installed on the repo yields a ruleset that looks
    # correct and still cannot push. Warn rather than fail: listing installations
    # needs admin:org, which the operator may deliberately not have granted.
    if INSTALLS=$(gh api "orgs/$ORG/installations" --jq '.installations[].app_slug' 2>/dev/null); then
      if ! printf '%s\n' "$INSTALLS" | grep -qx "$RELEASE_APP_SLUG"; then
        echo "WARNING: '$RELEASE_APP_SLUG' is not installed on $ORG. Do STEP 1-APP.3." >&2
      fi
    else
      echo "NOTE: could not list org installations (needs admin:org); skipping" >&2
      echo "      the install check. Confirm STEP 1-APP.3 was done." >&2
    fi
    echo
    ;;

  *)
    echo "BYPASS must be 'deploy-key' (repo admin) or 'app' (org owner); got '$BYPASS'." >&2
    exit 1
    ;;
esac

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
    $BYPASS_ACTOR_JSON
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
