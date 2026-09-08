"use strict";

// The one definition of "CSP-unsafe" in this repo, shared by both checkers:
// check-generated-js.js (emscripten output, run from each package's build.sh)
// and check-source-js.js (hand-written source under packages/*/src).
//
// A page served with a strict Content-Security-Policy — no `unsafe-eval` —
// kills eval() and the Function constructor at the call site. Anything that
// reaches either one is unusable there, which is why the codec builds are
// configured to avoid them (-sDYNAMIC_EXECUTION=0) and why the check runs at
// the end of every wasm build.
//
// Keeping the patterns here rather than in one of the two scripts means a rule
// added for generated code also covers source, and neither checker can drift
// into enforcing something subtly different from the other.
//
// These are text patterns, not a parser: a mention inside a comment or a
// string counts. That is deliberate — a checker that tried to tell them apart
// would need to be a JS parser, and the false positive is cheap to work around
// (say "the Function constructor", not the token) while a false negative is
// a CSP failure in someone's browser.
const FORBIDDEN_DYNAMIC_CODE = [
  ["eval()", /\beval\s*\(/],
  ["Function constructor", /\b(?:new\s+)?Function\s*\(/],
  ["Emscripten Function constructor", /\bnewFunc\s*\(\s*Function\s*,/],
];

/**
 * @param {string} source file contents
 * @returns {string[]} descriptions of every rule the file breaks
 */
function findViolations(source) {
  return FORBIDDEN_DYNAMIC_CODE.filter(([, pattern]) => pattern.test(source)).map(
    ([description]) => description
  );
}

module.exports = { FORBIDDEN_DYNAMIC_CODE, findViolations };
