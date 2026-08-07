// Generates the derived test fixtures for color and bit-depth coverage.
// Deterministic: every fixture is produced from data already committed in
// the repo (US1.RAW ultrasound RGB frame, CT2.RAW 16-bit CT slice) through
// the wasm encoders, so re-running this script after a codec change shows
// exactly which fixtures change and why.
//
// Usage: node tools/fixture-verification/gen/generate-fixtures.mjs
// Requires built dists (see BENCHMARKING.md / docker emsdk build).
//
// Lossless fixtures need no golden files: their reference is the source
// buffer itself, re-derived inside the tests with the same transforms
// exported from ./derive.mjs. The one lossy fixture (color JPEG) gets a
// committed .raw golden, cross-verified against DCMTK (see plan 034 /
// tools/fixture-verification/README.md).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gray8FromCT2, gray12FromCT2, gray16uFromCT2, deinterleavePlanes, packBitsSegment } from "./derive.mjs";

// getDecodedBuffer() returns a BYTE view; setting a Uint16Array into it
// would truncate every sample to its low byte. Always hand over bytes.
const bytes = (ta) => (ta instanceof Uint8Array && !(ta instanceof Buffer) ? ta : new Uint8Array(ta.buffer, ta.byteOffset ?? 0, ta.byteLength ?? ta.length));

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const P = (p) => resolve(repo, "packages", p);

async function load(pkg, file) {
  const mod = await import(P(`${pkg}/dist/${file}`));
  const factory = mod.default ?? mod;
  return await factory();
}

const us1 = readFileSync(P("openjpeg/test/fixtures/raw/US1.RAW")); // 640x480x3 interleaved RGB
const ct2 = readFileSync(P("charls/test/fixtures/CT2.RAW")); // 512x512 int16le
const RGB = { width: 640, height: 480, bitsPerSample: 8, componentCount: 3, isSigned: false };
const GRAY = (bps) => ({ width: 512, height: 512, bitsPerSample: bps, componentCount: 1, isSigned: false });

// ---- charls ----
{
  const codec = await load("charls", "charlsjs.js");
  const enc = (frameInfo, src, ilv, near = 0) => {
    const e = new codec.JpegLSEncoder();
    e.getDecodedBuffer(frameInfo).set(bytes(src));
    e.setInterleaveMode(ilv);
    e.setNearLossless(near);
    e.encode();
    const out = Buffer.from(e.getEncodedBuffer());
    e.delete();
    return out;
  };
  // interleave mode 2 (sample): source and decoded output are interleaved RGB
  writeFileSync(P("charls/test/fixtures/US1-color-ilv-sample.jls"), enc(RGB, us1, 2));
  writeFileSync(P("charls/test/fixtures/CT2-gray8.jls"), enc(GRAY(8), gray8FromCT2(ct2), 0));
  writeFileSync(P("charls/test/fixtures/CT2-gray16u.jls"), enc(GRAY(16), gray16uFromCT2(ct2), 0));
  console.log("charls fixtures written");
}

// ---- openjphjs (HTJ2K) ----
{
  const codec = await load("openjphjs", "openjphjs.js");
  const enc = (frameInfo, src) => {
    const e = new codec.HTJ2KEncoder();
    e.getDecodedBuffer(frameInfo).set(bytes(src));
    e.encode();
    const out = Buffer.from(e.getEncodedBuffer());
    e.delete();
    return out;
  };
  writeFileSync(P("openjphjs/test/fixtures/j2c/US1-color-nct.j2c"), enc({ ...RGB, isUsingColorTransform: false }, us1));
  writeFileSync(P("openjphjs/test/fixtures/j2c/US1-color-ct.j2c"), enc({ ...RGB, isUsingColorTransform: true }, us1));
  writeFileSync(P("openjphjs/test/fixtures/j2c/CT2-gray8.j2c"), enc({ ...GRAY(8), isUsingColorTransform: false }, gray8FromCT2(ct2)));
  writeFileSync(P("openjphjs/test/fixtures/j2c/CT2-gray12.j2c"), enc({ ...GRAY(12), isUsingColorTransform: false }, gray12FromCT2(ct2)));
  console.log("openjphjs fixtures written");
}

// ---- libjpeg-turbo-8bit (lossy color JPEG + committed golden) ----
{
  const codec = await load("libjpeg-turbo-8bit", "libjpegturbowasm.js");
  const e = new codec.JPEGEncoder();
  e.getDecodedBuffer(RGB).set(us1);
  e.encode();
  const jpg = Buffer.from(e.getEncodedBuffer());
  e.delete();
  writeFileSync(P("libjpeg-turbo-8bit/test/fixtures/jpeg/US1-color-420.jpg"), jpg);

  const d = new codec.JPEGDecoder();
  d.getEncodedBuffer(jpg.length).set(jpg);
  d.decode();
  const golden = Buffer.from(d.getDecodedBuffer());
  d.delete();
  writeFileSync(P("libjpeg-turbo-8bit/test/fixtures/raw/US1-color-420.raw"), golden);
  console.log("libjpeg-turbo-8bit color fixture + golden written (verify vs DCMTK!)");
}

// ---- dicom-codec (DICOM RLE, 3 segments = planar color) ----
{
  const planes = deinterleavePlanes(us1, 3);
  const segments = planes.map(packBitsSegment);
  const header = Buffer.alloc(64);
  header.writeUInt32LE(3, 0);
  let off = 64;
  segments.forEach((seg, i) => {
    header.writeUInt32LE(off, 4 * (i + 1));
    off += seg.length;
  });
  writeFileSync(P("dicom-codec/test/fixtures/rle/US1-color.rle"), Buffer.concat([header, ...segments]));
  console.log("dicom-codec RLE color fixture written");
}

console.log("DONE");
