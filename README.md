# codecs

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://codspeed.io/cornerstonejs/codecs?utm_source=badge)

## Packages

This repository is maintained as a monorepo. This means that this repository, instead of containing a single project, contains many projects. If you explore our project structure, you'll see the following:

```bash
├── packages                #
│   ├── charls-js           # 
│   ├── libjpeg-turbojs     # 
│   └── openjpegjs          #
│
├── ...                     # misc. shared configuration
├── pnpm-workspace.yaml     # MonoRepo (pnpm workspace) settings
├── package.json            # Shared devDependencies and commands
└── README.md               # This file
```

### Transfer Syntaxes

> ℹ List of DICOM Transfer syntaxes: [https://www.dicomlibrary.com/dicom/transfer-syntax/](https://www.dicomlibrary.com/dicom/transfer-syntax/). More on each transfer syntax, how they differ, and in which situations they excel can be found here: [https://www.medicalconnections.co.uk/kb/Transfer-Syntax](https://www.medicalconnections.co.uk/kb/Transfer-Syntax)

Transfer Syntax is the language used in DICOM to describe the DICOM file format and the network transfer methods. 3 main variables are contained in the Transfer Syntax:

- VR: Implicit/Explicit
- Endianism: Little-Endian/BigEndian
- Pixel Data Compression



| Transfer Syntax UID     | Transfer Syntax Name                                                | Codec          |
|-------------------------|---------------------------------------------------------------------|----------------|
| Uncompressed            |                                                                     |                |
| 1.2.840.10008.1.2       | Implicit VR Little Endian: Default DICOM Transfer Syntax            | Little Endian  |
| 1.2.840.10008.1.2.1     | Explicit VR Little Endian                                           | Little Endian  |
| 1.2.840.10008.1.2.2     | Explicit VR Big Endian                                              | Big Endian     |
| Lossless Compressed     |                                                                     |                |
| 1.2.840.10008.1.2.4.57  | JPEG Lossless, Nonhierarchical (Processes 14)                       | ?              |
| 1.2.840.10008.1.2.4.70  | JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])         | ?              |
| 1.2.840.10008.1.2.4.80  | JPEG-LS Lossless Image Compression                                  | CharLS         |
| 1.2.840.10008.1.2.4.90  | JPEG 2000 Image Compression (Lossless Only)                         | OpenJPEG       |
| 1.2.840.10008.1.2.5     | RLE Lossless                                                        | RLE            |
| Lossy Compressed        |                                                                     |                |
| 1.2.840.10008.1.2.4.50  | JPEG Baseline lossy process 1 (8 bit)*                              | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.51  | JPEG Baseline lossy process 2 & 4 (12 bit)                          | libJPEG-turbo  |
| 1.2.840.10008.1.2.4.81  | JPEG-LS Lossy (Near-Lossless) Image Compression                     | CharLS         |
| 1.2.840.10008.1.2.4.91  | JPEG 2000 Image Compression                                         | OpenJPEG       |
| 1.2.840.10008.1.2.4.92  | JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)** | OpenJPEG?      |
| 1.2.840.10008.1.2.4.93  | JPEG 2000 Part 2 Multicomponent Image Compression**                 | OpenJPEG?      |
| MPEG                    |                                                                     |                |
| 1.2.840.10008.1.2.4.100 | MPEG-2                                                              | Not supported  |
| 1.2.840.10008.1.2.4.101 | MPEG-2                                                              | Not supported  |
| 1.2.840.10008.1.2.4.102 | MPEG-4                                                              | Not supported  |
| 1.2.840.10008.1.2.4.103 | MPEG-4                                                              | Not supported  |
| Special                 |                                                                     |                |
| 1.2.840.10008.1.2.4.94  | JPIP                                                                | Not supported  |
| 1.2.840.10008.1.2.4.95  | JPIP-Deflate                                                        | Not supported  |
| 1.2.840.10008.1.2.1.99  | Deflated Explicit VR Little Endian ***                              | Little Endian  |

- \* - 1.2.840.10008.1.2.4.50: 8-bit RGB can leverage the browser's built in decoder.
- \*\* - 1.2.840.10008.1.2.4.\[92|93\]: Not supported in previous image loaders; OpenJPEG may work with these
- \*\*\* - Unlike all other DICOM transfer syntaxes, the deflate transfer syntaxes compress the whole of the DICOM data (tags, lengths, VR etc.) rather than just the pixel data - this is done using the standard “deflate” mechanism as used in gzip etc.) It is therefore most suitable for non-pixel objects such as structured reports, presentation states etc.

- 5: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeRLE.js)
- 57 & 70: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/codecs/jpegLossless.js)
- 1.2 & 2.1 & 99: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeLittleEndian.js)
- 2.2: [JS Decoder](https://github.com/cornerstonejs/cornerstoneWADOImageLoader/blob/4bfa04759412d58647cc5d6bd0204aa37e4542e3/src/shared/decoders/decodeBigEndian.js)



### Building the wasm codecs

The five wasm codecs (`charls`, `libjpeg-turbo-8bit`, `libjpeg-turbo-12bit`, `openjpeg`, `openjphjs`) need emscripten and cmake 3.17. You do not need to *work* inside a container to get them — `docker:build` mounts the repo into the same toolchain image CI uses and runs the package's `build.sh` there, writing `build/` and `dist/` back onto the host:

```bash
pnpm docker:build                     # all five
pnpm docker:build charls openjpeg     # just these
pnpm --filter @cornerstonejs/codec-openjph docker:build
```

Initialise a codec's submodule first (`git submodule update --init --recursive packages/<pkg>/extern`); the script checks and tells you if it is missing. On Windows the repo's drive must be shared with Docker Desktop.

The remaining packages (`big-endian`, `little-endian`, `dicom-codec`) are plain JS — build those natively with `pnpm run build`. `.devcontainer/` still works if you prefer it, but note it pins an older emsdk than CI; [tools/docker/Dockerfile](tools/docker/Dockerfile) is the one that matches.

### CI

The workspace is a [pnpm workspace][pnpm-workspaces]; `pnpm -r run <cmd>` and `pnpm --filter <pkg> run <cmd>` drive every task. Install with `pnpm install` (Corepack picks the pinned pnpm version from `package.json`'s `packageManager` field).

Pull requests build and test the packages that changed (compared against the `main` branch), in [.github/workflows/pr-checks.yml](.github/workflows/pr-checks.yml). Merges to `main` version, tag and publish through [.github/workflows/release.yml](.github/workflows/release.yml) — see [tools/release/README.md](tools/release/README.md) for how that works and what the one-time setup was.

"Semantic commit" messages, and the files included in the commit, determine how package versions are updated and what goes into the changelogs. Example commit messages include:

- `fix(charls-decode): should not break when no config option is provided`
- `feat(encode): add encode API method`
- `feat(encode)!: friendlier API method`

Preview what the next release would publish at any time:

```bash
pnpm release:plan
```

### Benchmarking

Per-PR performance regression detection runs on CodSpeed via
[`.github/workflows/pr-checks.yml`](.github/workflows/pr-checks.yml)
(`codspeed-bench` job). Bench sources live under
`packages/*/bench/*.bench.js` and are driven by `vitest bench`.

We run CodSpeed in `mode: simulation` (Cachegrind, not wall-clock), so
the numbers on the dashboard are **modeled instruction time on a
reference CPU** — deterministic and ideal for catching regressions, but
not honest wall-clock that a user's browser would see. JS-heavy loops
inflate 30–100× vs production V8 (no JIT under Cachegrind); wasm decode
kernels inflate ~5–15×.

Each wasm codec package has three kinds of benches:

- `instantiate+destroy X` — pure constructor/destructor lifecycle cost
- `decode X — cold` — first decode call on a fresh decoder instance
- `decode X — warm` — Nth decode call on a decoder pre-warmed with 5
  untimed iterations at module load (mirrors cornerstone3D's
  `local.decoder` caching pattern)

See [`BENCHMARKING.md`](BENCHMARKING.md) for the full measurement model,
why simulation was chosen over walltime, how to read each bench type,
what the CodSpeed warnings mean, and how to add new benches.

### Codec Package Anatomy

...

<!--
    LINKS
-->


[pnpm-workspaces]: https://pnpm.io/workspaces
