# Self-hosted CodSpeed benchmark runner

The `codspeed-bench` job in `.github/workflows/pr-checks.yml` runs on a
**dedicated self-hosted runner** (`runs-on: [self-hosted, codspeed-bench]`)
instead of GitHub's shared pool.

## Why

CodSpeed simulation mode (Cachegrind) derives its modeled CPU cache from the
**physical** runner CPU. GitHub's shared runners randomly assign different
hardware (Intel Xeon 8370C vs AMD EPYC 7763), so identical source produces
different instruction counts run-to-run and CodSpeed flags "Different runtime
environments detected". A single fixed box removes that variable: every run —
baseline and PR — is measured on the same hardware, so Simulation is stable
and the regression gate is trustworthy.

## What the box must provide

- **OS**: Linux x64.
- **valgrind** installed and on `PATH` (`valgrind --version`). CodSpeed's
  simulation runs the benches under valgrind; the box must have it (the job
  does not install it).
- **git** and outbound network (to reach github.com and codspeed.io).
- Node is provisioned per-job by `actions/setup-node@v4` (node 22), so it does
  not need to be pre-installed — but the runner user must be able to write to
  the actions tool cache.
- A C toolchain is **not** needed here: this job only downloads prebuilt
  `dist-*` artifacts and runs `vitest bench`; the wasm is compiled in the
  `build` job on GitHub-hosted runners.

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
- **Dedicate the box to this label** and let it run **one GitHub job at a
  time** (the default). This is about not co-scheduling *other* jobs on the
  box mid-run, not about intra-job parallelism — that stays on.
- The only hard requirement for cross-run stability is a **fixed CPU model**
  (don't migrate the box between different physical CPUs), since the modeled
  cache is derived from it.

> If the **walltime** job (`codspeed-macro`, `mode: walltime`) is ever moved
> onto a self-hosted box, this advice inverts: wall-clock needs an isolated,
> pinned core with turbo/SMT off and nothing else running. Keep walltime and
> simulation on separate runners.

## Registering the runner

1. Repo → **Settings → Actions → Runners → New self-hosted runner** → Linux/x64.
2. Follow the download/configure steps GitHub shows. When configuring, add the
   custom label so the workflow can target it:
   `./config.sh --url https://github.com/cornerstonejs/codecs --token <token> --labels codspeed-bench`
   (the `self-hosted`, `Linux`, `X64` labels are added automatically).
3. Install it as a service so it survives reboots (`./svc.sh install && ./svc.sh start`).
4. Confirm it shows **Idle** in Settings → Actions → Runners.

## Cutover order (important)

1. **Register and start the runner first** (above). If the workflow merges
   before a runner with the `codspeed-bench` label is online, the
   `codspeed-bench` job queues indefinitely.
2. Merge this change to `main`.
3. The push to `main` runs `codspeed-bench` on the new runner and **re-seeds
   the CodSpeed baseline on the fixed hardware**. Until that main run
   completes, the first PR comparisons will show a one-time environment shift
   (old shared-runner baseline vs new fixed-hardware head) — that is expected
   and self-resolves after the baseline is re-seeded.

## Rollback

Revert `runs-on` back to `ubuntu-24.04` on the `codspeed-bench` job. The next
`main` run re-seeds the baseline on GitHub-hosted hardware again.
