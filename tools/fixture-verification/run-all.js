// Fixture verification: decode every encoded test fixture with the
// from-scratch decoders in this directory and binary-compare against the
// committed .raw/.RAW references. Also asserts cross-package equality of
// the shared CT1/CT2 references.
//
// Usage: node tools/fixture-verification/run-all.js
//
// These decoders share no code with the codecs under test (wasm builds,
// jpeg-lossless-decoder-js, dicom-codec's rleLossless): an agreement here
// means two independent implementations produce identical pixels.
"use strict";
const fs = require("fs");
const path = require("path");
const { decodeRLE16 } = require("./rle.js");
const { decodeJPLL } = require("./jpll.js");
const { decodeJLS } = require("./jls.js");
const { decodeSequentialDCT } = require("./jpegdct.js");

const repo = path.resolve(__dirname, "../..");
const F = (p) => fs.readFileSync(path.join(repo, "packages", p));

const results = [];
function check(name, actual, expected) {
  const ok = actual.equals(expected);
  let detail = "";
  if (!ok) {
    let d = 0;
    for (let i = 0; i < Math.min(actual.length, expected.length); i++)
      if (actual[i] !== expected[i]) d++;
    detail = ` (differing bytes: ${d}, lenA=${actual.length}, lenB=${expected.length})`;
  }
  results.push([name, ok ? "BYTE-EXACT" : "MISMATCH" + detail]);
}

// --- JPEG-LS (charls) ---
check("charls CT1.RAW               <- JPEG-LS(CT1.JLS)", decodeJLS(F("charls/test/fixtures/CT1.JLS")).bytes, F("charls/test/fixtures/CT1.RAW"));
check("charls CT2.RAW               <- JPEG-LS(CT2.JLS)", decodeJLS(F("charls/test/fixtures/CT2.JLS")).bytes, F("charls/test/fixtures/CT2.RAW"));
check("charls near-lossless.RAW     <- JPEG-LS(.81, NEAR=1)", decodeJLS(F("charls/test/fixtures/CT-512x512-near-lossless.JLS")).bytes, F("charls/test/fixtures/CT-512x512-near-lossless.RAW"));

// --- shared CT1/CT2 references across packages ---
// charls, openjpeg and openjph encode the same two CT slices; all three
// packages must reference identical pixels. Verifying the JPEG-LS decode
// above therefore also validates the J2K and HTJ2K references below.
check("openjpeg CT1.RAW             == charls CT1.RAW", F("openjpeg/test/fixtures/raw/CT1.RAW"), F("charls/test/fixtures/CT1.RAW"));
check("openjpeg CT2.RAW             == charls CT2.RAW", F("openjpeg/test/fixtures/raw/CT2.RAW"), F("charls/test/fixtures/CT2.RAW"));
check("openjphjs CT1.RAW            == charls CT1.RAW", F("openjphjs/test/fixtures/raw/CT1.RAW"), F("charls/test/fixtures/CT1.RAW"));
check("openjphjs CT2.RAW            == charls CT2.RAW", F("openjphjs/test/fixtures/raw/CT2.RAW"), F("charls/test/fixtures/CT2.RAW"));

// --- DICOM RLE + JPEG Lossless (dicom-codec) ---
const ctRaw = F("dicom-codec/test/fixtures/raw/CT-512x512.raw");
check("dicom-codec CT-512x512.raw   <- RLE decoder", decodeRLE16(F("dicom-codec/test/fixtures/rle/CT-512x512.rle"), 512, 512), ctRaw);
check("dicom-codec CT-512x512.raw   <- JPEG-Lossless (p14, predictor 6)", decodeJPLL(F("dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14.jpll")).bytes, ctRaw);
check("dicom-codec CT-512x512.raw   <- JPEG-Lossless (sv1, predictor 1)", decodeJPLL(F("dicom-codec/test/fixtures/jpeg-lossless/CT-512x512-process14-sv1.jpll")).bytes, ctRaw);

// --- DCT JPEG (libjpeg-turbo) ---
check("8bit jpeg400jfif.raw         <- JPEG decoder (SOF0 + DRI)", decodeSequentialDCT(F("libjpeg-turbo-8bit/test/fixtures/jpeg/jpeg400jfif.jpg")).bytes, F("libjpeg-turbo-8bit/test/fixtures/raw/jpeg400jfif.raw"));
check("12bit CT-512x512-12bit.raw   <- JPEG decoder (SOF1, 12-bit)", decodeSequentialDCT(F("libjpeg-turbo-12bit/test/fixtures/jpeg/CT-512x512-12bit.jpg")).bytes, F("libjpeg-turbo-12bit/test/fixtures/raw/CT-512x512-12bit.raw"));

const width = Math.max(...results.map(([n]) => n.length));
for (const [n, r] of results) console.log(n.padEnd(width + 2) + r);
const bad = results.filter(([, r]) => r !== "BYTE-EXACT").length;
console.log(`\n${results.length - bad}/${results.length} checks byte-exact${bad ? ` - ${bad} FAILED` : ""}`);
process.exit(bad ? 1 : 0);
