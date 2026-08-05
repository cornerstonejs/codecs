#!/usr/bin/env bash
#
# Run a command while holding the shared "nashua" box mutex.
#
# The nashua machine hosts THREE self-hosted GitHub runners — one per repo, since
# a runner registers to exactly one repository:
#
#   cornerstonejs/codecs        label: codspeed-bench   (this repo — CodSpeed bench)
#   cornerstonejs/cornerstone3D label: nashua           (Playwright + OHIF downstream)
#   OHIF/Viewers                label: nashua           (Playwright)
#
# Each runner takes one job at a time, so left alone the box would run up to
# three heavy jobs simultaneously. GitHub's `concurrency:` is scoped per
# repository and cannot coordinate across repos (let alone across the two orgs),
# so the mutex lives on the box's filesystem instead.
#
# Why codecs takes this lock — NOT for Playwright:
#   - The bench job saturates every core: valgrind runs ~60x slower than native
#     and `lerna run bench --parallel` fans out across all of them. The other two
#     repos measure Playwright wall-clock behaviour, which flakes badly under
#     that load (and their browsers plus valgrind together strain box RAM).
#   - In the other direction, a starved bench job trips vitest 3's hard-coded 60s
#     worker-RPC timer, which counts REAL seconds while valgrind stretches the
#     process — so contention turns a slow job into a noisy one.
#   - CodSpeed *simulation* numbers themselves are contention-immune (Cachegrind
#     models a CPU cache per process, so instruction counts do not shift when
#     other work runs alongside). This lock protects job duration, flakiness and
#     memory headroom — not count stability. See docs/ci/self-hosted-runner.md.
#
# The lock file is named ...-playwright.lock for historical reasons: Playwright
# was its first and, until now, only user. It is really "the nashua heavy-job
# mutex". Do NOT rename it here alone — the path is the only thing tying the
# three repos together, and a mismatch silently disables the mutex instead of
# failing loudly. Renaming means changing all three copies in lockstep.
#
# This script can NOT be shared across the repos (separate repositories), so each
# carries its own copy at its own path — codecs: tools/ci/with-nashua-lock.sh,
# cornerstone3D: scripts/ci/with-nashua-lock.sh, OHIF: .scripts/ci/with-nashua-lock.sh.
# Only the NASHUA_LOCK_FILE default below has to agree.
#
# flock holds the lock via fd 9 and it releases automatically when the wrapped
# command exits — including on job cancel / timeout / SIGKILL — so there are no
# stale locks to clean up.
#
# Usage: bash tools/ci/with-nashua-lock.sh <command> [args...]

# Strict mode: -e abort on any unhandled command failure, -u treat use of an
# unset variable as an error, -o pipefail make a pipeline fail if ANY stage
# fails (not just the last). Catches mistakes early instead of pressing on.
set -euo pipefail

LOCK="${NASHUA_LOCK_FILE:-/var/tmp/nashua-playwright.lock}"   # MUST match cornerstone3D's and OHIF's copies
LOCK_WAIT="${NASHUA_LOCK_WAIT:-5400}"                          # max seconds to wait

# Guard: a command to wrap is required. With no arguments there is nothing to
# run, so print usage and exit instead of silently grabbing and releasing the
# lock for no reason (which would mask a mis-wired workflow step).
if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

# Open the lock file on fd 9 (read-write, create if missing, never truncate).
# A failure here is usually ownership, not absence: whichever repo's job runs
# first creates the file, so all three runners must run as the same OS user (or
# the file must be pre-created world-writable). See docs/ci/self-hosted-runner.md.
exec 9<>"$LOCK" || { echo "::error::cannot open lock file $LOCK (check it is writable by the runner user)"; exit 1; }

# Try instantly; if busy, report who holds it, then block up to LOCK_WAIT.
if ! flock -n 9; then
  echo "nashua box busy — held by: $(cat "${LOCK}.info" 2>/dev/null || echo unknown). Waiting up to ${LOCK_WAIT}s…"
  if ! flock -w "$LOCK_WAIT" 9; then
    echo "::error::Timed out after ${LOCK_WAIT}s waiting for the nashua box lock"
    exit 1
  fi
fi

# Record the current holder for other jobs' "held by" message (best-effort).
echo "${GITHUB_REPOSITORY:-local}#${GITHUB_RUN_ID:-0} @ $(date -u +%FT%TZ 2>/dev/null || true)" > "${LOCK}.info" 2>/dev/null || true
echo "✅ Acquired nashua box lock ($LOCK); running: $*"

# Replace the shell with the command. fd 9 is inherited (not close-on-exec), so
# the lock is held for the whole command and released when it exits.
exec "$@"
