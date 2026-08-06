# Self-hosted CodSpeed benchmark runner

The `codspeed-bench` job in `.github/workflows/bench.yml` runs on a
**dedicated self-hosted runner** (`runs-on: [self-hosted, codspeed-bench, nashua]`)
instead of GitHub's shared pool.

The runner is dedicated to this repo, but the **machine is not**: the box
("nashua") also hosts runners for `cornerstonejs/cornerstone3D` and
`OHIF/Viewers`. A filesystem mutex keeps the three repos' heavy jobs from
colliding — see [Sharing the box](#sharing-the-box-the-nashua-flock-mutex).

## Why

CodSpeed simulation mode (Cachegrind) derives its modeled CPU cache from the
**physical** runner CPU. GitHub's shared runners randomly assign different
hardware (Intel Xeon 8370C vs AMD EPYC 7763), so identical source produces
different instruction counts run-to-run and CodSpeed flags "Different runtime
environments detected". A single fixed box removes that variable: every run —
baseline and PR — is measured on the same hardware, so Simulation is stable
and the regression gate is trustworthy.

## What the box must provide

- **OS**: **Ubuntu 22.04 / 24.04, or Debian 12**, x86_64 or aarch64 — not general
  "Linux x64" latitude. The CodSpeed runner maps the distro onto one of two deb
  builds and bails with "Unsupported system" otherwise; at v4.18.2 the guard is
  literally `version == "22.04" || version == "12"`, so **Debian 11 and Ubuntu
  20.04 are out**, even though CodSpeed's CLI docs list them as supported (that
  claim is about the CLI generally, not the valgrind deb targets). Debian 12 maps
  to the `ubuntu-22.04` asset. nashua is Ubuntu 24.04 x86_64.
- **CodSpeed's own valgrind build** — see [Valgrind](#valgrind-codspeeds-own-build).
  Do *not* install the distro or snap valgrind.
- **`libc6-dbg`** (glibc debug symbols) — the CodSpeed runner checks for this
  package explicitly alongside valgrind. Already present on nashua.
- **git** and outbound network — github.com, codspeed.io, and the
  valgrind-codspeed release assets.
- **flock** (from `util-linux`, present on any stock Linux) — `tools/ci/with-nashua-lock.sh`
  needs it for the shared-box mutex below.
- Node is provisioned per-job by `actions/setup-node@v4`, pinned to an **exact**
  version (`22.23.1`) rather than the `'22'` range the other jobs use — see
  [Hardware hygiene](#hardware-hygiene-for-stable-numbers) for why. It does not
  need to be pre-installed; the runner user only needs write access to the actions
  tool cache. The box's own nvm-managed node is irrelevant, since setup-node
  prepends its install to the job's `PATH`.
- **yarn is *not* required on the box** — and is in fact absent there, since the
  other two repos use pnpm. GitHub's hosted images preinstall yarn 1, which is
  what this workflow used to rely on implicitly. The bench job now provisions it
  per-job with Corepack instead:
  ```yaml
  corepack enable yarn
  corepack prepare yarn@1.22.22 --activate
  ```
  Corepack is bundled with node 22 and fetches over Node's own https. That is
  deliberate rather than incidental: `npm i -g yarn` is unreliable here because
  the npm reachable from the GitHub runner's *bundled* node on this box is
  corrupted (`Cannot find module '../lib/cli.js'`) — the same wall OHIF's workflow
  hit, which is why it provisions pnpm through Corepack too. Note node 25
  unbundles Corepack, so a major node bump means revisiting that step.
- A C toolchain is **not** needed here: this job only downloads prebuilt
  `dist-*` artifacts and runs `vitest bench`; the wasm is compiled in the
  `build` job on GitHub-hosted runners.

## Valgrind (CodSpeed's own build)

> **"Runner" is overloaded — this section means the CodSpeed one.** Three distinct
> things go by that name here: the **GitHub Actions runner** (the `Runner.Listener`
> agent registered to one repo — three of them on this box, installed with
> `config.sh`/`svc.sh`); the **CodSpeed runner** (`codspeed-runner`, the binary
> `CodSpeedHQ/action` downloads into the job, which drives valgrind and uploads
> results); and CodSpeed's hosted **macro runners** (`runs-on: codspeed-macro`,
> used by the separate `codspeed-walltime` job). Everything below about detecting
> and installing valgrind is the **CodSpeed runner**.

CodSpeed does **not** use the distro's valgrind. Simulation mode runs on a
patched Callgrind, and the CodSpeed runner rejects any `valgrind --version` string
that does not contain `.codspeed` ("not a CodSpeed build"). So `apt install
valgrind` is pointless — it would just be replaced — and the **snap is actively
wrong**, because its confinement blocks instrumenting host binaries.

Left to itself, the action installs the right build: it downloads
`valgrind_<version>_ubuntu-<release>_<arch>.deb` from
[CodSpeedHQ/valgrind-codspeed](https://github.com/CodSpeedHQ/valgrind-codspeed/releases)
and installs it with apt, caching the result under `$HOME/.cache/codspeed-action`
(`cache-instruments` defaults to `true`, so it is a one-time cost per box). **That
install needs root**, and the CodSpeed runner checks for a non-interactive path
before taking it: either it is already root, or `sudo -n true` succeeds.

On nashua the GitHub Actions runner's service account deliberately has **no
passwordless sudo** — that account executes PR-supplied code for a public repo on
a box shared with two other repos' runners, so a standing root grant is not worth
it. Valgrind is therefore **pre-installed by hand and held**, which makes the
CodSpeed runner short-circuit: when a new-enough `.codspeed` valgrind *and*
`libc6-dbg` are already present it never attempts to elevate.

### Which version

The version is pinned by the action version, so read it off the chain rather than
guessing:

1. `CodSpeedHQ/action@vX.Y.Z` → the `.codspeed-runner-version` file in that tag
   (which CodSpeed runner version the action downloads).
2. That tag of `CodSpeedHQ/runner` → `src/binary_pins.rs` →
   `VALGRIND_CODSPEED_VERSION` and `VALGRIND_CODSPEED_ITERATION`.
3. The deb is `<version>-0codspeed<iteration>`. A *higher* iteration also passes
   the CodSpeed runner's check; an older one does not.

For the currently pinned `CodSpeedHQ/action@v4.18.2` (CodSpeed runner 4.18.2) that
is **3.26.0 iteration 4**:

```bash
curl -fL -o /tmp/valgrind-codspeed.deb \
  https://github.com/CodSpeedHQ/valgrind-codspeed/releases/download/3.26.0-0codspeed4/valgrind_3.26.0-0codspeed4_ubuntu-24.04_amd64.deb
sudo apt-get install -y /tmp/valgrind-codspeed.deb
sudo apt-mark hold valgrind

valgrind --version                       # want: valgrind-3.26.0.codspeed4
dpkg -s libc6-dbg | grep -m1 Status      # want: install ok installed
```

Those two commands mirror the CodSpeed runner's own gate, which is why they are the
ones to trust — see `src/executor/valgrind/setup.rs` in
[CodSpeedHQ/runner](https://github.com/CodSpeedHQ/runner/blob/v4.18.2/src/executor/valgrind/setup.rs)
at the pinned tag. `is_valgrind_installed()` requires both:

- `get_valgrind_status()` → runs `which valgrind`, then `valgrind --version`, then
  rejects any string without `.codspeed` and any `(version, iteration)` below the
  pin;
- `apt::is_package_installed("libc6-dbg")` → literally `dpkg -s libc6-dbg`.

When both pass, `apt::install_cached` skips the install step entirely ("check if
already installed — if yes, skip everything"), and that is precisely what keeps
sudo out of the picture.

### Why it is held

Ubuntu's own valgrind is `1:3.22.0-0ubuntu2` — note the **epoch `1:`**, against
CodSpeed's un-epoched `3.26.0-0codspeed4`. The epoch dominates dpkg's version
ordering, so apt considers the *older* distro build an upgrade: a routine
`apt upgrade`, or an unattended security update, would silently swap out the
CodSpeed build. The next bench run would then see "not a CodSpeed build", try to
reinstall it, find no passwordless sudo, and fail. `apt-mark hold valgrind`
prevents that — confirm with `apt-mark showhold`, or `dpkg -s valgrind` showing
`Status: hold ok installed`. The cost is that valgrind stops getting distro
security updates, which is the right trade for a tool that only ever instruments
our own benchmarks.

### When bumping `CodSpeedHQ/action`

A new action version can raise the valgrind pin, which makes a box visit a
**prerequisite of the bump** — otherwise the bench step fails during setup
(loudly, not silently):

```bash
sudo apt-mark unhold valgrind
sudo apt-get install -y /tmp/<new-valgrind-codspeed>.deb
sudo apt-mark hold valgrind
```

Do it on the box *before* merging the bump, and expect the new valgrind to shift
instruction counts — treat it like any other environment change and let one
`main` run re-seed the baseline.

## Hardware hygiene (for stable numbers)

This runner hosts the **simulation** gate only, which changes what matters:

- **Simulation is clock- and concurrency-independent.** Cachegrind counts
  instructions on a *modeled* CPU cache, per process — so turbo boost, SMT,
  and the CPU governor do **not** affect the numbers, and running benches in
  parallel does not corrupt them (each valgrind process models its own cache).
  You do **not** need the strict single-core isolation that wall-clock
  benchmarking requires.
- **Multiple cores are a throughput win.** valgrind runs ~60× slower than
  native, so the job is CPU-bound; the workflow already fans out with
  `lerna run bench --parallel`, which uses all available cores. More threads →
  the job finishes faster, with identical instruction counts.
- **Keep it to one heavy job on the box at a time.** Each runner on nashua
  takes one GitHub job at a time (the default), but the three runners are
  independent processes and nothing stops all three from starting at once. The
  flock mutex below is what actually enforces one-at-a-time; it is about not
  co-scheduling *other repos'* heavy jobs mid-run, not about intra-job
  parallelism — that stays on.
- The only hard requirement for cross-run stability is a **fixed CPU model**
  (don't migrate the box between different physical CPUs), since the modeled
  cache is derived from it.
- **Pin node exactly, never by range.** Given a range like `'22'`, setup-node uses
  any satisfying version already in the tool cache *without consulting the
  network*. On a self-hosted box that cache persists, so the bench silently
  freezes on the first 22.x it ever saw and then jumps whenever the box is
  rebuilt or the cache is cleared — and V8 changes between patch releases move
  instruction counts. Both codspeed jobs pin `22.23.1`, the version the current
  baseline was measured on. Changing it is a deliberate re-seed event, exactly
  like a glibc or valgrind bump.
- **Don't casually `apt upgrade` the box.** glibc is the sharpest example:
  different glibc builds dispatch different code paths, so a bump shifts
  instruction counts much as a different CPU would — that is the subject of
  CodSpeed's own [write-up](https://codspeed.io/blog/unrelated-benchmark-regression)
  on unrelated benchmark regressions. Patch deliberately rather than
  incidentally, then let one `main` run re-seed the baseline. Keeping valgrind
  held (above) also keeps *it* out of any such upgrade.

> If the **walltime** job (`codspeed-macro`, `mode: walltime`) is ever moved
> onto a self-hosted box, this advice inverts: wall-clock needs an isolated,
> pinned core with turbo/SMT off and nothing else running. Keep walltime and
> simulation on separate runners.

## Sharing the box: the nashua flock mutex

Three repos have a self-hosted runner on nashua. A runner registers to exactly
one repository, so each repo needs its own runner process:

| Repo | Runner label | Heavy job |
| --- | --- | --- |
| `cornerstonejs/codecs` (this repo) | `codspeed-bench` + `nashua` | CodSpeed simulation benches under valgrind |
| `cornerstonejs/cornerstone3D` | `nashua` | Playwright (`playwright.yml`, `ohif-downstream.yml`) |
| `OHIF/Viewers` | `nashua` | Playwright (`playwright.yml`) |

Labels only select runners *within* a repo, so the `nashua` label on the other
two and `codspeed-bench` here never interact — and GitHub's `concurrency:` is
scoped per repository, so it cannot coordinate across repos either (let alone
across the two orgs). The only thing tying the three together is a lock file on
the box's filesystem, taken with `flock`:

```
/var/tmp/nashua-playwright.lock
```

Each repo carries its own copy of the wrapper script, because a script cannot be
shared across separate repositories:

| Repo | Wrapper |
| --- | --- |
| codecs | `tools/ci/with-nashua-lock.sh` |
| cornerstone3D | `scripts/ci/with-nashua-lock.sh` |
| OHIF/Viewers | `.scripts/ci/with-nashua-lock.sh` |

The paths differ; **the lock path must not**. All three default to the same
`NASHUA_LOCK_FILE`, and a mismatch silently disables the mutex rather than
failing loudly. Renaming it means changing all three repos in lockstep.

### Why the name says "playwright"

Historical: Playwright was the mutex's first and, until codecs joined, only
user. It is really "the nashua heavy-job mutex". The misleading name is kept
because the path is the coordination mechanism itself — a rename that lands in
one repo before the others leaves the box unprotected. Read
`nashua-playwright.lock` as "nashua is busy", not "Playwright is running".

### Why the bench job takes it (Playwright is not the reason here)

- The bench job **saturates every core**: valgrind runs ~60× slower than native
  and `lerna run bench --parallel` fans out across all of them. Playwright
  suites in the other two repos measure wall-clock behaviour and flake badly
  under that load; their browsers plus valgrind together also strain box RAM.
- In the other direction, a **starved bench job gets noisy**: vitest 3's
  hard-coded 60s worker-RPC timer counts *real* seconds while valgrind stretches
  the process, so contention makes those structural "Timeout calling
  onTaskUpdate" failures more likely.
- What is **not** at risk is CodSpeed simulation's numbers themselves.
  Cachegrind models a CPU cache per process, so instruction counts do not shift
  because other work is running (see [Hardware hygiene](#hardware-hygiene-for-stable-numbers)).
  This lock buys predictable job duration, fewer flakes and memory headroom —
  not measurement stability. Fixed *hardware* is what buys that.

### How it is wired

`with-nashua-lock.sh` opens the lock file on fd 9, `flock`s it, then `exec`s the
wrapped command, which inherits the fd. The lock therefore lives exactly as long
as the command — released automatically on success, failure, job cancel, timeout
or SIGKILL, so there are no stale locks to clean up. If the lock is busy it logs
the current holder (from `<lock>.info`) and waits up to `NASHUA_LOCK_WAIT`
(default 5400s / 90 min) before failing the step.

In `bench.yml` the wrapper sits **inside** the CodSpeed action's `run:`:

```yaml
run: bash tools/ci/with-nashua-lock.sh yarn lerna run bench --parallel --stream …
```

Two reasons it goes there rather than in an earlier step: a flock is held by a
process, and each workflow step is a separate process, so it *cannot* span
steps; and this scopes the mutex to the CPU-hungry bench fan-out, letting the
action's setup and result upload overlap with another repo's run. The job's
`timeout-minutes: 180` covers the worst case of a 90 min wait followed by a full
bench run.

### Operational gotchas

- **All three runners should run as the same OS user.** Whichever repo's job
  runs first *creates* `/var/tmp/nashua-playwright.lock`, owned by that user with
  mode 0644; a second runner under a different user then fails to open it
  read-write and the step errors with `cannot open lock file`. Check all three
  with `grep -H '^User=' /etc/systemd/system/actions.runner.*.service` (that is
  the identity that matters — not whoever ran `config.sh`). Note the asymmetry:
  root can open a lock file owned by anyone, so a runner accidentally installed
  as root locks out the others rather than itself.

  If the users must differ, make the files world-writable. When they do not exist
  yet:
  ```bash
  sudo install -m 0666 /dev/null /var/tmp/nashua-playwright.lock
  sudo install -m 0666 /dev/null /var/tmp/nashua-playwright.lock.info
  ```
  When they already exist, `chmod` instead — and only while the box is idle.
  `chmod` keeps the inode, whereas replacing the file would leave an in-flight
  job holding a lock on the old inode while the next job locks the new one, so
  both would run:
  ```bash
  sudo chmod 0666 /var/tmp/nashua-playwright.lock /var/tmp/nashua-playwright.lock.info
  ```
- **`/var/tmp`, not `/tmp`**, is deliberate: `/tmp` is frequently a tmpfs and is
  cleaned far more aggressively (systemd-tmpfiles defaults: 10 days for `/tmp`,
  30 for `/var/tmp`), so `/var/tmp` survives reboots and idle weeks.
- **Never set `PrivateTmp=yes` on the runner services.** It gives each unit a
  private `/tmp` *and* `/var/tmp`, which would hand every runner its own lock
  file — the mutex would then do nothing, silently. The runner's own
  `svc.sh`-generated unit does not set it; keep it that way.
- **Waiting is invisible in the job's step list.** A job blocked on the mutex
  looks like a long-running "Run CodSpeed benchmarks" step; the log line
  `nashua box busy — held by: <repo>#<run-id>` is the tell.
- **Local runs don't need the wrapper** — call `yarn lerna run bench` directly.
  It does work off the box if you want it (`NASHUA_LOCK_FILE=/tmp/my.lock bash
  tools/ci/with-nashua-lock.sh …`).

## Registering the runner

1. Repo → **Settings → Actions → Runners → New self-hosted runner** → Linux/x64.
2. Unpack it into its **own directory**, separate from the cornerstone3D and
   OHIF runners already on the box (each runner needs its own `_work`), and run
   it as the **same OS user** as those two — see the lock-ownership gotcha above.
3. Follow the download/configure steps GitHub shows. When configuring, add the
   label the workflow targets:
   `./config.sh --url https://github.com/cornerstonejs/codecs --token <token> --name "OHIF Ubuntu Server - Nashua" --labels codspeed-bench,nashua`
   (`self-hosted`, `Linux`, `X64` are added automatically). That matches the
   runner currently registered for this repo, and **both** custom labels are
   needed: the job asks for `runs-on: [self-hosted, codspeed-bench, nashua]`, so a
   runner missing either one is never picked and the job queues forever. `nashua`
   also records which box this is; labels never cross repos, so it cannot collide
   with the identically-labelled cornerstone3D and OHIF runners. Note the runner
   name is **not private**: it is printed as
   `Runner name:` in the **Set up job** log of every run and this repo is public,
   so pick a name you are happy publishing (the interactive default is the
   machine's hostname — which is logged as `Machine name:` either way).
4. Install it as a service so it survives reboots (`./svc.sh install && ./svc.sh start`).
   Each runner directory installs its own service; the unit is named
   `actions.runner.cornerstonejs-codecs.<runner-name>`.
5. Confirm it shows **Idle** in Settings → Actions → Runners, and as the runner
   user: `valgrind --version` prints a `.codspeed` build (see
   [Valgrind](#valgrind-codspeeds-own-build)) and `flock --version` works.
   `sudo -n true` is *expected to fail* here — that is precisely why valgrind is
   pre-installed rather than left to the action.

## Cutover order (important)

1. **Register and start the runner first** (above). If the workflow merges before
   a runner carrying **both** the `codspeed-bench` and `nashua` labels is online,
   the `codspeed-bench` job queues indefinitely.
2. Merge this change to `main`.
3. The push to `main` runs `codspeed-bench` on the new runner and **re-seeds
   the CodSpeed baseline on the fixed hardware**. Until that main run
   completes, the first PR comparisons will show a one-time environment shift
   (old shared-runner baseline vs new fixed-hardware head) — that is expected
   and self-resolves after the baseline is re-seeded.

## Rollback

Revert `runs-on` back to `ubuntu-24.04` on the `codspeed-bench` job. The next
`main` run re-seeds the baseline on GitHub-hosted hardware again.

The lock wrapper can stay in place through a rollback — on an ephemeral
GitHub-hosted VM it just acquires an uncontended lock and `exec`s the command —
but it is dead weight there, so drop it from the `run:` (and drop
`timeout-minutes: 180` back to something tighter) if the revert is permanent.
