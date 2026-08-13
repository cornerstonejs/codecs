import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const checkerPath = fileURLToPath(
  new URL("./check-generated-js.js", import.meta.url)
)
const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function runChecker(source) {
  const directory = mkdtempSync(join(tmpdir(), "codec-csp-check-"))
  temporaryDirectories.push(directory)
  writeFileSync(join(directory, "generated.js"), source)

  return spawnSync(process.execPath, [checkerPath, directory], {
    encoding: "utf8",
  })
}

describe("generated JavaScript CSP checker", () => {
  it.each([
    ["eval()", 'eval("dynamic code")', "eval()"],
    ["Function()", 'Function("return 1")', "Function constructor"],
    ["new Function()", 'new Function("return 1")', "Function constructor"],
    [
      "Emscripten Function adapter",
      'newFunc(Function, "arg", "return arg")',
      "Emscripten Function constructor",
    ],
  ])("rejects %s", (_name, source, expectedViolation) => {
    const result = runChecker(source)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(expectedViolation)
  })

  it("accepts generated JavaScript without dynamic code", () => {
    const result = runChecker("const add = (left, right) => left + right")

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("CSP-safe generated JavaScript: 1 file(s) checked")
  })
})
