# Benchmarking

This repo's benches run on every PR via CodSpeed. This document explains
what the numbers mean, why they don't match real wall-clock time, and how
to read warnings from the CodSpeed dashboard.

Bench files live under `packages/*/bench/*.bench.js` and are driven by
`vitest bench` + `@codspeed/vitest-plugin@^4`. The full pipeline is in
`.github/workflows/pr-checks.yml` (job: `codspeed-bench`).

## TL;DR

- We run CodSpeed in **`mode: simulation`** — Cachegrind/Valgrind-based
  CPU simulation, not wall-clock timing.
- Numbers like `19.8 ms` are modeled instruction-time on a reference CPU
  with a modeled cache hierarchy, **not** what a user's machine takes to
  run the bench.
- The numbers are **deterministic and reproducible** (<1% run-to-run
  drift on most benches), so they're great for catching regressions.
- They are **not honest wall-clock**. For JIT-heavy JS loops the model
  inflates 30–100× vs production V8; for wasm decode kernels it's ~5–15×;
  for pure compute it's roughly 1×.

## Why simulation, not walltime

CodSpeed has two instruments: `simulation` (Cachegrind) and `walltime`
(real CPU, statistical sampling on macro-runners).

| | Simulation | Walltime |
|---|---|---|
| What it measures | Modeled instruction time | Real wall-clock |
| Determinism | <1% drift | 1–3% drift |
| Runner | Standard GHA runner | CodSpeed macro-runner |
| Cost | Free CI minutes | Macro-runner minutes |
| Honest about syscalls | No (excludes them) | Yes |
| Honest about JIT tier-up | No (depends on tier at bench time) | Yes |
| Good for | Regression detection on a PR | Absolute production-like timing |

We chose simulation because regression detection is the primary goal —
catching "this PR slowed openjpeg by 5%" matters more than knowing the
exact ms a user's browser will take.

## How the numbers get inflated

Cachegrind disables V8's optimizing JIT — code runs in the interpreter
(Ignition) or baseline JIT (Sparkplug) the whole time. The interpreter
retires roughly an order of magnitude more low-level instructions per
logical JS operation than TurboFan-optimized native code.

Specific patterns and their typical inflation factor vs production:

- **Tight JS loops** (e.g., `big-endian` byte-swap loop): 30–100×.
  That's why `big-endian 16-bit + swap, 512×512` shows ~73 ms here
  but is ~1–3 ms in a real browser.
- **Wasm decode kernels** (charls, openjpeg, openjphjs, libjpeg-turbo):
  ~5–15×. Wasm runs under Valgrind without JIT but doesn't suffer the
  Ignition penalty as badly.
- **Pure compute / native syscalls**: ~1× or excluded entirely.

## How to read each bench type

The codec packages each expose four kinds of benches per fixture:

### `instantiate+destroy XDecoder` / `instantiate+destroy XEncoder`
The cost of `new Decoder(); decoder.delete()` in isolation. Includes
embind plumbing (`makeClassHandle`, `RegisteredPointer_fromWireType`,
finalizer setup), V8's object-handle allocation, and the wasm-side
constructor/destructor. Tracks lifecycle regressions.

### `decode X — cold`
A fresh decoder/encoder instance whose first `.decode()` / `.encode()`
call happens inside the bench body. Models **frame 1 of a worker
session**.

In practice "cold" here measures per-instance setup cost, not truly
cold-everything: the warmup of the sibling `warmDec` at module load
runs first, so by the time the cold bench fires the wasm heap is
already grown and the wasm decode path is already tiered. The
cold-vs-warm delta therefore isolates **per-instance state cost**
(internal working buffers, instance-local allocations), not
module-load cost.

### `decode X — warm`
A shared decoder/encoder that's been pre-warmed with **5 untimed
decode/encode iterations at module load**. The bench body is the 6th+
call. Models **frames 2..N** of a worker session — the dominant case
for stack scrolling, since cornerstone3D's `decodeJPEGLS.ts:73`,
`decodeJPEG2000.ts:68`, and `decodeJPEGBaseline8Bit.ts:61` all cache
the decoder on `local.decoder` and reuse it.

Bench bodies between cold and warm are **identical code shape** — the
only difference is module-load state, so the delta is a clean
"first-instance-call overhead" signal.

### Pure JS decode (`big-endian`, `little-endian`)
No decoder class — just a function call. These have no cold/warm split
and no instantiation bench.

### Dispatcher integration (`dicom-codec`)
Calls `dicomCodec.decode(bytes, info, uid)` per transfer syntax. Under
CodSpeed each bench runs once, so each dispatcher bench measures the
**first-call-per-UID** cost — including wasm module instantiation
through the `runProcess → initialize` path in
`packages/dicom-codec/src/codecs/codecFactory.js:80`. That's why
dispatcher numbers are 12–32× larger than the corresponding raw codec
bench: the dispatcher pays the cold-start tax once per UID.

## Warnings on the CodSpeed dashboard

### "N system calls totalling Xs of execution time, excluded from the measure"
Some wasm decode benches fire syscalls during the bench window — `mmap`
for wasm heap growth, page faults on cold pages, `futex` for V8 worker
thread coordination. Cachegrind can't honestly model syscall cost
(its multiplier blows up), so CodSpeed excludes those from the headline
number and posts this warning.

**What to do**: nothing. The headline value is still your reliable
regression signal — it's the instruction-counted decoder work alone.
The "Xs of execution time" the warning mentions is Cachegrind's model
producing nonsense for syscalls; not real elapsed time. The cold/warm
split here keeps the warning from showing up on warm benches because
the wasm heap is already grown and pages are already touched by the
module-load warmup.

### "Anonymous function" or ` :3` in the flame graph
V8's wasm runtime hosts JIT-compiled wasm code in an anonymous function
chunk. Cachegrind has no symbol info for that JIT'd code, so the flame
graph collapses to one opaque box. You can't drill into "where inside
decode is the time spent" for wasm code — that's a fundamental
limitation of wasm-via-V8-via-Cachegrind. For wasm hotspot analysis,
profile the native build with `perf` / Instruments / VTune instead.

### Tier-related regression in `instantiate+destroy X`
The instantiation bench measures whatever V8 tier the embind helpers
(`makeClassHandle`, `RegisteredPointer_fromWireType`, etc.) happen to
be in at bench time. If the bench file's module load calls the
constructor a few times (e.g., once per fixture for the cold decoder
instances), V8 has more samples to tier up the embind code before the
instantiation bench runs, and that bench reports a lower number. With
only one constructor call at module load, the instantiation bench runs
in baseline tier and reports higher. This is a Cachegrind artifact,
not a real production regression — V8 tiers up after a handful of
calls in any real app.

## Run-to-run variance

We've verified on three runs of identical source (commits `a5b8ee6`,
`5ada4ee`, `fa2db51`) that:
- 22 of 29 benches reproduce **bit-exact** across runs
- 6 drift ≤ 1.1% (measurement floor on µs-scale benches)
- The cold/warm split eliminated the previously noisy benches by
  pinning wasm allocator state via module-load warmup

If a single PR shows a < 5% delta on a noisy bench, look at two more
runs before believing it. For the stable benches (which is most of
them), a 3% delta is real signal.

## Adding a new bench

For a wasm codec, follow the pattern in
`packages/charls/bench/decode.bench.js`:

1. Read fixtures at module top, gated on `existsSync(distPath)`.
2. Create one **cold** decoder per fixture (constructed only — never
   call decode at module load).
3. Create one **shared warm** decoder; loop `decode()` 5 times on it
   at module load using the **largest** fixture, so the wasm heap
   never needs to regrow when smaller fixtures hit the warm bench.
4. Pair each fixture: `bench("decode X — cold", ...)` and
   `bench("decode X — warm", ...)` with identical bench bodies.
5. Include `bench("instantiate+destroy XDecoder", ...)` for the
   lifecycle signal.

For a pure-JS package, just call the function — no cold/warm split, no
instantiation bench.

## Pointer

If you're trying to understand a specific bench's behaviour, the
flame-graph URL on codspeed.io shows the per-function breakdown
(though wasm code resolves to anonymous chunks — see warnings above).
Each bench file in this repo has a top-of-file comment with the
codec-specific rationale.
