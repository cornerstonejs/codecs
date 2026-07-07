# Fixture verification

Independent, from-scratch decoders used to verify that the `.raw`/`.RAW`
pixel references committed under `packages/*/test/fixtures` are correct.
They share **no code** with the codecs under test (the emscripten wasm
builds, `jpeg-lossless-decoder-js`, or dicom-codec's `rleLossless.js`), so
byte-exact agreement means two independent implementations produce the
same pixels from the same codestream.

```
node tools/fixture-verification/run-all.js
```

Exit code 0 and `12/12 checks byte-exact` means every verifiable fixture
matches.

## What is covered, and how

| Decoder | File | Spec | Verifies |
|---|---|---|---|
| JPEG-LS (LOCO-I) | `jls.js` | ITU-T T.87 (regular + run mode, NEAR >= 0, LSE presets) | `charls` CT1.RAW, CT2.RAW, CT-512x512-near-lossless.RAW |
| JPEG Lossless | `jpll.js` | ITU-T T.81 process 14, SOF3, predictors 1-7 | `dicom-codec` CT-512x512.raw (via both .jpll fixtures) |
| DICOM RLE | `rle.js` | PS3.5 Annex G | `dicom-codec` CT-512x512.raw |
| Sequential DCT JPEG | `jpegdct.js` | ITU-T T.81 SOF0/SOF1, restart intervals; integer "islow" IDCT with libjpeg's exact fixed-point constants (PASS1_BITS 2 for 8-bit, 1 for 12-bit) | `libjpeg-turbo-8bit` jpeg400jfif.raw, `libjpeg-turbo-12bit` CT-512x512-12bit.raw |

The openjpeg (J2K) and openjphjs (HTJ2K) CT1/CT2 references are validated
transitively: those packages' fixtures encode the same two CT slices as
charls, and `run-all.js` asserts the three packages' RAW files are
byte-identical, so the from-scratch JPEG-LS decode pins all of them.

Additional independent confirmation performed while creating the
references (not automated here because it needs external tools): DCMTK's
`dcmdjpeg` decodes the JPEG Lossless fixtures and the 12-bit JPEG fixture
to the same bytes.

## Known limitations

- `openjpeg/test/fixtures/raw/CT-512x512-lossy.raw` cannot be verified by
  an independent decoder: the 9/7 irreversible wavelet makes lossy J2K
  output implementation-defined. It is a regression golden pinning the
  openjpeg build's own deterministic output (identical across the asm.js,
  wasm and decode-only variants).
- The openjphjs corpus SHA-256 pins (`test/corpus.test.js`) beyond CT1/CT2
  are likewise regression goldens of the OpenJPH build's output.
- A byte-exact IDCT match for the DCT JPEGs is possible because
  libjpeg-turbo's C `islow` path is deterministic; a different IDCT
  implementation would legitimately differ by +-1. If libjpeg-turbo is ever
  rebuilt with SIMD enabled, re-check rather than assume.

## Bug found by this verification

`jpeg-lossless-decoder-js` (used by dicom-codec for transfer syntaxes
.57/.70) decodes the final pixel of the SV1 fixture as 0 instead of -2000.
Four independent decoders agree the fixture is correct: the from-scratch
`jpll.js` here, DCMTK's `dcmdjpeg`, the RLE decode of the same slice, and
the library's own Process-14 path. See the pinned `it.fails` test in
`packages/dicom-codec/test/integration.test.js`.
