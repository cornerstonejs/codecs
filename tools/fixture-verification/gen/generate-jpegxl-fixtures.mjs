// Generates the JPEG XL test fixtures under
// packages/dicom-codec/test/fixtures/jpeg-xl from the cornerstone
// viewer-testdata DICOM corpus.
//
// Usage:
//   node tools/fixture-verification/gen/generate-jpegxl-fixtures.mjs [testdata-root]
//
// testdata-root defaults to ../viewer-testdata relative to this repo, and can
// also be set with CORNERSTONE_TESTDATA. Requires built dists for libjxl and
// libjpeg-turbo-8bit (see BENCHMARKING.md / `pnpm docker:build`).
//
// Unlike generate-fixtures.mjs, the sources here are NOT committed to this
// repo — viewer-testdata is a separate checkout, and the DICOM files are far
// too large to vendor. So this script also writes manifest.json, which records
// for every fixture the frame geometry and the SHA-256 of the pixels it must
// decode to. That manifest is what the test asserts against, which means the
// suite verifies the fixtures without needing viewer-testdata present.
//
// Two decoded references are committed alongside as .raw so that a failure
// shows up as a byte diff on real pixels rather than only as a hash mismatch:
// the first CT slice and the single-frame WSI tile.
//
// Everything here is lossless (transfer syntax 1.2.840.10008.1.2.4.110), so
// re-running against the same sources reproduces byte-identical fixtures.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse, fragments } from "./dicom-read.mjs";

const JPEG_BASELINE = "1.2.840.10008.1.2.4.50";
const JPEG_XL_LOSSLESS = "1.2.840.10008.1.2.4.110";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = resolve(repo, "packages/dicom-codec/test/fixtures/jpeg-xl");

const testdata = resolve(
  process.argv[2] ?? process.env.CORNERSTONE_TESTDATA ?? resolve(repo, "../viewer-testdata")
);

// The CT series is the 143-slice stack that ships with the scoord bounding-box
// study: 512x512, 16-bit, PixelRepresentation 1 (signed, real Hounsfield
// values around [-2048, 1700]). Sixteen consecutive slices from the middle of
// the stack cover anatomy rather than the mostly-air end slices.
const CT_DIR = join(testdata, "dcm/scoord3d-and-scoord/scoord-bounding-box");
const CT_FRAME_COUNT = 16;

// Whole-slide microscopy, JPEG baseline, YBR_FULL_422, 3x8-bit. The corpus has
// a single-frame instance and several multi-frame ones; ".933" (4 frames) is
// the smallest multi-frame instance, and its first two frames stand in for the
// two-frame case the corpus itself does not contain.
const SM_DIR = join(testdata, "dcm/sm");
const SM_ONE_FRAME = "SM.1.2.276.0.7230010.3.1.4.1458473091.20792.1628847203.934.dcm";
const SM_MULTI_FRAME = "SM.1.2.276.0.7230010.3.1.4.1458473091.20792.1628847203.933.dcm";
const SM_MULTI_FRAME_COUNT = 2;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const asBytes = (typedArray) =>
  Buffer.from(typedArray.buffer, typedArray.byteOffset ?? 0, typedArray.byteLength);

/** Sixteen consecutive CT slices, ordered by InstanceNumber, as raw pixel buffers. */
function readCtFrames() {
  if (!existsSync(CT_DIR)) {
    throw new Error(
      `CT source series not found at ${CT_DIR}.\n` +
        "Pass the viewer-testdata root as argv[1] or set CORNERSTONE_TESTDATA. " +
        "Note that dcm/scoord3d-and-scoord is not tracked in the viewer-testdata " +
        "repository, so a fresh clone will not have it; the committed fixtures and " +
        "their manifest hashes remain the reference either way."
    );
  }

  const slices = [];
  for (const name of readdirSync(CT_DIR).filter((f) => /\.dcm$/i.test(f))) {
    let ds;
    try {
      ds = parse(join(CT_DIR, name));
    } catch {
      continue;
    }
    if (ds.modality !== "CT") continue;
    slices.push(ds);
  }
  slices.sort((a, b) => a.instanceNumber - b.instanceNumber);

  if (slices.length < CT_FRAME_COUNT) {
    throw new Error(`expected >= ${CT_FRAME_COUNT} CT slices in ${CT_DIR}, found ${slices.length}`);
  }

  const start = Math.floor(slices.length / 2) - CT_FRAME_COUNT / 2;
  return slices.slice(start, start + CT_FRAME_COUNT).map((ds) => ({
    instanceNumber: ds.instanceNumber,
    imageInfo: {
      rows: ds.rows,
      columns: ds.columns,
      bitsAllocated: ds.bitsAllocated,
      samplesPerPixel: ds.samplesPerPixel,
      pixelRepresentation: ds.pixelRepresentation,
      signed: ds.pixelRepresentation === 1,
    },
    pixels: Buffer.from(ds.buf.subarray(ds.pixelStart, ds.pixelStart + ds.pixelLen)),
  }));
}

/** Decodes `count` JPEG-baseline WSI frames to interleaved 8-bit RGB. */
async function readWsiFrames(dicomCodec, file, count) {
  const ds = parse(join(SM_DIR, file));
  const encodedFrames = fragments(ds);
  if (encodedFrames.length < count) {
    throw new Error(`${file}: wanted ${count} frames, found ${encodedFrames.length}`);
  }

  const imageInfo = {
    rows: ds.rows,
    columns: ds.columns,
    bitsAllocated: ds.bitsAllocated,
    samplesPerPixel: ds.samplesPerPixel,
    pixelRepresentation: ds.pixelRepresentation ?? 0,
    signed: false,
  };

  const frames = [];
  for (let i = 0; i < count; i++) {
    const decoded = await dicomCodec.decode(
      new Uint8Array(encodedFrames[i]),
      imageInfo,
      JPEG_BASELINE
    );
    frames.push({ imageInfo, pixels: asBytes(decoded.imageFrame) });
  }
  return { sopInstanceUid: ds.sopInstanceUid, numberOfFrames: ds.numberOfFrames, frames };
}

async function main() {
  // pathToFileURL, not the bare path: on Windows an absolute path starts with
  // a drive letter, which the ESM loader reads as an unsupported URL scheme.
  const dicomCodec = (
    await import(pathToFileURL(resolve(repo, "packages/dicom-codec/src/index.js")).href)
  ).default;

  mkdirSync(outDir, { recursive: true });
  const entries = [];

  const encodeLossless = async (name, { imageInfo, pixels }, source) => {
    const encoded = await dicomCodec.encode(new Uint8Array(pixels), imageInfo, JPEG_XL_LOSSLESS);
    const bitstream = asBytes(encoded.imageFrame);
    writeFileSync(join(outDir, `${name}.jxl`), bitstream);

    // Prove the fixture decodes back to exactly what went in before pinning
    // its hash — a corrupt encode must not be able to mint its own reference.
    const decoded = await dicomCodec.decode(bitstream, imageInfo, JPEG_XL_LOSSLESS);
    if (!asBytes(decoded.imageFrame).equals(pixels)) {
      throw new Error(`${name}: lossless round trip did not reproduce the source pixels`);
    }

    entries.push({
      file: `${name}.jxl`,
      source,
      rows: imageInfo.rows,
      columns: imageInfo.columns,
      bitsAllocated: imageInfo.bitsAllocated,
      samplesPerPixel: imageInfo.samplesPerPixel,
      pixelRepresentation: imageInfo.pixelRepresentation,
      signed: imageInfo.signed,
      decodedBytes: pixels.length,
      decodedSha256: sha256(pixels),
      encodedBytes: bitstream.length,
    });

    return bitstream;
  };

  // ---- 16 CT slices ----
  const ctFrames = readCtFrames();
  for (const [index, frame] of ctFrames.entries()) {
    const name = `ct-512x512-s${String(index).padStart(2, "0")}`;
    await encodeLossless(name, frame, {
      dataset: "viewer-testdata dcm/scoord3d-and-scoord/scoord-bounding-box",
      modality: "CT",
      instanceNumber: frame.instanceNumber,
      transferSyntax: "1.2.840.10008.1.2.1 (uncompressed)",
    });
    if (index === 0) {
      writeFileSync(join(outDir, `${name}.raw`), frame.pixels);
    }
  }

  // ---- WSI colour, one-frame and two-frame instances ----
  const oneFrame = await readWsiFrames(dicomCodec, SM_ONE_FRAME, 1);
  await encodeLossless("wsi-1frame-512x512-f00", oneFrame.frames[0], {
    dataset: "viewer-testdata dcm/sm",
    modality: "SM (whole-slide microscopy)",
    sopInstanceUid: oneFrame.sopInstanceUid,
    numberOfFrames: oneFrame.numberOfFrames,
    frameIndex: 0,
    transferSyntax: `${JPEG_BASELINE} (JPEG baseline, YBR_FULL_422 -> RGB)`,
  });
  writeFileSync(join(outDir, "wsi-1frame-512x512-f00.raw"), oneFrame.frames[0].pixels);

  const twoFrame = await readWsiFrames(dicomCodec, SM_MULTI_FRAME, SM_MULTI_FRAME_COUNT);
  for (const [index, frame] of twoFrame.frames.entries()) {
    await encodeLossless(`wsi-2frame-512x512-f${String(index).padStart(2, "0")}`, frame, {
      dataset: "viewer-testdata dcm/sm",
      modality: "SM (whole-slide microscopy)",
      sopInstanceUid: twoFrame.sopInstanceUid,
      numberOfFrames: twoFrame.numberOfFrames,
      frameIndex: index,
      transferSyntax: `${JPEG_BASELINE} (JPEG baseline, YBR_FULL_422 -> RGB)`,
    });
  }

  writeFileSync(
    join(outDir, "manifest.json"),
    `${JSON.stringify(
      {
        description:
          "JPEG XL (1.2.840.10008.1.2.4.110, lossless) fixtures generated by " +
          "tools/fixture-verification/gen/generate-jpegxl-fixtures.mjs. " +
          "decodedSha256 is the SHA-256 of the pixels each bitstream must decode to.",
        fixtures: entries,
      },
      null,
      2
    )}\n`
  );

  const total = entries.reduce((n, e) => n + e.encodedBytes, 0);
  console.log(`${entries.length} fixtures written to ${outDir} (${(total / 1024).toFixed(0)} KiB)`);
}

await main();
