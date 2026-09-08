import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const checkerPath = fileURLToPath(new URL("./check-source-js.js", import.meta.url))
const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/**
 * Builds a throwaway packages/ tree and runs the checker over it.
 *
 * @param {Record<string, string>} files paths relative to the packages
 *   directory, e.g. "codec-a/src/index.js", mapped to their contents.
 */
function runChecker(files) {
  const packagesDirectory = mkdtempSync(join(tmpdir(), "codec-csp-source-"))
  temporaryDirectories.push(packagesDirectory)

  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(packagesDirectory, relativePath)
    mkdirSync(join(fullPath, ".."), { recursive: true })
    writeFileSync(fullPath, contents)
  }

  return spawnSync(process.execPath, [checkerPath, packagesDirectory], {
    encoding: "utf8",
  })
}

describe("hand-written source CSP checker", () => {
  it.each([
    ["eval()", 'const r = eval("require")', "eval()"],
    ["Function()", 'const f = Function("return 1")', "Function constructor"],
    ["new Function()", 'const f = new Function("return 1")', "Function constructor"],
  ])("rejects %s in a package's src/", (_name, source, expectedViolation) => {
    const result = runChecker({ "codec-a/src/index.js": source })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(expectedViolation)
    expect(result.stderr).toContain("index.js")
  })

  it("accepts source without dynamic code", () => {
    const result = runChecker({
      "codec-a/src/index.js": "const add = (left, right) => left + right",
      "codec-a/src/nested/deep.js": "module.exports = 1",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("CSP-safe source: 2 file(s) checked")
  })

  // The regression this exists to catch: reaching a node builtin without an
  // evaluated require. If this ever fails, the replacement in jpegxl.js has
  // been reverted to something the checker would reject.
  it("accepts process.getBuiltinModule", () => {
    const result = runChecker({
      "codec-a/src/index.js": [
        'const { createRequire } = process.getBuiltinModule("module")',
        'const { readFileSync } = process.getBuiltinModule("fs")',
        "module.exports = { createRequire, readFileSync }",
      ].join("\n"),
    })

    expect(result.status).toBe(0)
  })

  it("searches nested directories", () => {
    const result = runChecker({
      "codec-a/src/codecs/deep/nested.js": 'eval("x")',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("nested.js")
  })

  // Tests and benches never reach a browser, and tools/csp's own fixtures
  // must contain the forbidden tokens to test for them.
  it.each([
    ["test", "codec-a/test/thing.test.js"],
    ["bench", "codec-a/bench/thing.bench.js"],
  ])("ignores %s files outside src/", (_name, relativePath) => {
    const result = runChecker({
      [relativePath]: 'eval("this is not shipped")',
      "codec-a/src/index.js": "module.exports = 1",
    })

    expect(result.status).toBe(0)
  })

  it("ignores built output, so a package's own dist does not double-report", () => {
    const result = runChecker({
      "codec-a/dist/generated.js": 'eval("emscripten output")',
      "codec-a/src/index.js": "module.exports = 1",
    })

    expect(result.status).toBe(0)
  })

  it("reports every offending file, not just the first", () => {
    const result = runChecker({
      "codec-a/src/one.js": 'eval("x")',
      "codec-b/src/two.js": 'new Function("y")',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("one.js")
    expect(result.stderr).toContain("two.js")
  })

  it("fails on a missing packages directory", () => {
    const result = spawnSync(
      process.execPath,
      [checkerPath, join(tmpdir(), "codec-csp-does-not-exist")],
      { encoding: "utf8" }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("No packages directory")
  })
})
