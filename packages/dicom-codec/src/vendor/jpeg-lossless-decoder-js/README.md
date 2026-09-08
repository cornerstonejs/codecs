# Vendored: jpeg-lossless-decoder-js

`lossless.cjs` and `lossless.cjs.map` are **build output, not source**. Do not
edit them here — fix the upstream repository and re-vendor.

| | |
| --- | --- |
| Upstream | <https://github.com/cornerstonejs/JPEGLosslessDecoderJS> (fork of `rii-mango/JPEGLosslessDecoderJS`) |
| Branch | `main` — upstream `master` plus the byte-aligned-end-of-scan fix |
| Commit | `03bb80c073e34369893e468b615dac9dcb0dcee9` |
| Version | 2.1.2 + the fix |
| License | MIT, retained alongside as `LICENSE` |

## Why this is vendored rather than a dependency

dicom-codec used the published `jpeg-lossless-decoder-js@2.1.2` for transfer
syntaxes 1.2.840.10008.1.2.4.57 and .70. That release drops the final sample of
any frame whose last Huffman code ends exactly on a byte boundary — the
`markerIndex` guards read the 0xFF that introduces EOI as if it were entropy
coded data and abandon the scan one sample early. DCMTK produces exactly that
layout whenever a frame ends in a run of one value, so real CT images decoded
with a wrong last pixel.

The fix lives in the fork above. The fork is not published to npm, so the built
CJS bundle is committed here and required directly by
[`../../codecs/jpegLossless.js`](../../codecs/jpegLossless.js). When a release
of `jpeg-lossless-decoder-js` carries the fix, delete this directory and go back
to a normal dependency.

The bundle is a single self-contained file with no runtime dependencies, and its
source map embeds the TypeScript sources, so debugging still lands in
`decoder.ts` rather than in minified output.

## Re-vendoring

```bash
git clone -b main https://github.com/cornerstonejs/JPEGLosslessDecoderJS.git
cd JPEGLosslessDecoderJS
npm install
npm test          # 54 tests, includes the byte-aligned-end regression
npm run build
cp release/cjs/lossless.cjs release/cjs/lossless.cjs.map LICENSE \
   <codecs>/packages/dicom-codec/src/vendor/jpeg-lossless-decoder-js/
```

Copy the files verbatim and record the new commit in the table above — an
unmodified copy is what makes "is this really what that commit builds?"
answerable by rebuilding.
