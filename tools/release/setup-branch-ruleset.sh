#!/usr/bin/env bash
#
# One-time setup: move main's protection from classic branch protection to a
# repository ruleset that lists the GitHub Actions app as a bypass actor.
#
# WHY
#   The release workflow pushes the `chore(release): publish` commit and the
#   per-package tags with the built-in GITHUB_TOKEN. Classic branch protection
#   has no bypass list — only repo admins skip the pull-request requirement —
#   which is why the CircleCI release had to push with a maintainer's personal
#   SSH key. Rulesets do support bypass actors, so migrating lets the bot push
#   with no personal credential anywhere in the pipeline.
#
#   A ruleset cannot relax classic protection: when both exist GitHub applies
#   the most restrictive of the two. The classic rule must therefore be deleted,
#   which is why this script does both halves.
#
# WHAT CHANGES FOR HUMANS
#   Nothing. The ruleset below reproduces main's current rules exactly:
#   1 approving review, code-owner review required, stale reviews dismissed on
#   push, last-push approval required, no force pushes, no branch deletion.
#
# PREREQUISITES
#   gh auth login, as a repo admin.
#
# Verify afterwards with:
#   gh api repos/cornerstonejs/codecs/rulesets
#   gh api repos/cornerstonejs/codecs/branches/main/protection   # expect 404

set -euo pipefail

REPO="${REPO:-cornerstonejs/codecs}"

# The built-in GITHUB_TOKEN acts as the "GitHub Actions" app installation, and
# the bypass actor below is keyed on that app's id. Resolved at runtime rather
# than hardcoded to 15368: the value differs on GitHub Enterprise Server, and a
# wrong id produces a ruleset that looks correct but silently fails to let the
# release workflow push.
GITHUB_ACTIONS_APP_ID=$(gh api apps/github-actions --jq .id)

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
      "actor_id": $GITHUB_ACTIONS_APP_ID,
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
