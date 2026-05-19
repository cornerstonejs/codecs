#!/usr/bin/env node
// Reads benchmark JSON files from /tmp/benchmarks (one per <package>-<side>),
// builds a markdown table comparing main → PR for each codec, and posts or
// updates a single sticky comment on the PR via the GitHub REST API.
//
// Required env vars:
//   GITHUB_TOKEN            – GitHub PAT with `repo` scope (or fine-grained
//                             "pull request: write")
//   CIRCLE_PULL_REQUEST     – CircleCI provides this on PR builds, e.g.
//                             https://github.com/owner/repo/pull/123
//   CIRCLE_PROJECT_USERNAME – GitHub org / user owning the repo
//   CIRCLE_PROJECT_REPONAME – repo name
//
// Set DRY_RUN=1 to print the rendered markdown to stdout and skip the API call.

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const https = require("node:https")

const BENCHMARK_DIR = process.env.BENCHMARK_DIR || "/tmp/benchmarks"
const MARKER = "<!-- codecs-benchmark-comment -->"
const PACKAGES = [
  "charls",
  "libjpeg-turbo-8bit",
  "libjpeg-turbo-12bit",
  "openjpeg",
  "openjphjs",
  "little-endian",
  "big-endian",
  "dicom-codec",
]

function readJsonLine(file) {
  if (!fs.existsSync(file)) return null
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line)
    } catch {
      continue
    }
  }
  return null
}

function pctDelta(before, after) {
  if (!before || before === 0) return null
  return ((after - before) / before) * 100
}

function fmtMs(v) {
  if (v == null || Number.isNaN(v)) return "—"
  if (v < 0.01) return v.toFixed(4)
  if (v < 1) return v.toFixed(3)
  return v.toFixed(2)
}

function fmtPct(p) {
  if (p == null || !Number.isFinite(p)) return "—"
  const sign = p > 0 ? "+" : ""
  let badge = ""
  if (p > 5) badge = " :red_circle:"
  else if (p < -5) badge = " :green_circle:"
  return `${sign}${p.toFixed(1)}%${badge}`
}

function statusBadge(status) {
  if (status === "pass") return ":white_check_mark:"
  if (status === "fail") return ":x:"
  return "—"
}

function buildTable() {
  const rows = []
  rows.push("| Package | Build | Test | Operation | Fixture | Main (ms) | PR (ms) | Δ |")
  rows.push("|---|:---:|:---:|---|---|---:|---:|---:|")

  let anyData = false
  let anyFail = false
  for (const pkg of PACKAGES) {
    const main = readJsonLine(path.join(BENCHMARK_DIR, `${pkg}-main.json`))
    const pr = readJsonLine(path.join(BENCHMARK_DIR, `${pkg}-pr.json`))
    const buildStatus = readJsonLine(path.join(BENCHMARK_DIR, `${pkg}-build.json`))
    const testStatus = readJsonLine(path.join(BENCHMARK_DIR, `${pkg}-test.json`))

    const buildCell = statusBadge(buildStatus?.buildStatus)
    const testCell = statusBadge(testStatus?.testStatus)
    if (buildStatus?.buildStatus === "fail" || testStatus?.testStatus === "fail") {
      anyFail = true
    }

    if (!main && !pr && !buildStatus && !testStatus) continue
    anyData = true

    const operation = pr?.operation ?? main?.operation ?? "—"
    const fixture = pr?.fixture ?? main?.fixture ?? "—"

    if (pr?.error && main?.error) {
      rows.push(`| \`${pkg}\` | ${buildCell} | ${testCell} | — | — | — | — | _${pr.error}_ |`)
      continue
    }
    if (pr?.error) {
      rows.push(
        `| \`${pkg}\` | ${buildCell} | ${testCell} | ${operation} | ${fixture} | ${fmtMs(main?.meanMs)} | _error_ | _${pr.error}_ |`
      )
      continue
    }
    if (operation === "noop") {
      rows.push(`| \`${pkg}\` | ${buildCell} | ${testCell} | _${operation}_ | ${fixture} | — | — | — |`)
      continue
    }

    const mainMs = main?.meanMs
    const prMs = pr?.meanMs
    const delta = pctDelta(mainMs, prMs)
    rows.push(
      `| \`${pkg}\` | ${buildCell} | ${testCell} | ${operation} | ${fixture} | ${fmtMs(mainMs)} | ${fmtMs(prMs)} | ${fmtPct(delta)} |`
    )
  }

  return { table: rows.join("\n"), anyData, anyFail }
}

function parsePrNumber() {
  const url = process.env.CIRCLE_PULL_REQUEST
  if (!url) return null
  const m = url.match(/\/pull\/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function ghRequest({ method, path: apiPath, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        host: "api.github.com",
        path: apiPath,
        method,
        headers: {
          "User-Agent": "cornerstonejs-codecs-ci",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          if (res.statusCode >= 400) {
            return reject(
              new Error(`GitHub API ${res.statusCode}: ${raw.slice(0, 500)}`)
            )
          }
          try {
            resolve(raw ? JSON.parse(raw) : null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on("error", reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function findExistingComment({ token, owner, repo, prNumber }) {
  let page = 1
  while (true) {
    const comments = await ghRequest({
      method: "GET",
      path: `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
      token,
    })
    if (!Array.isArray(comments) || comments.length === 0) return null
    const hit = comments.find((c) => c.body && c.body.includes(MARKER))
    if (hit) return hit
    if (comments.length < 100) return null
    page++
  }
}

async function main() {
  const { table, anyData, anyFail } = buildTable()
  if (!anyData) {
    console.log("No benchmark JSON files found in", BENCHMARK_DIR)
    console.log("Skipping comment.")
    return
  }

  const sha = process.env.CIRCLE_SHA1 || "unknown"
  const buildUrl = process.env.CIRCLE_BUILD_URL || ""
  const header = anyFail
    ? "### :x: Codec CI — one or more packages failed"
    : "### :white_check_mark: Codec CI — main vs PR"
  const body = [
    MARKER,
    header,
    "",
    `_Commit \`${sha.slice(0, 7)}\` • ${ITERATIONS_NOTE} • [CI run](${buildUrl})_`,
    "",
    table,
    "",
    "Δ is `(PR − main) / main × 100`. :red_circle: > +5% (slower), :green_circle: < −5% (faster). Rows with `dist not built` indicate the package wasn't touched on this branch (and its source wasn't rebuilt).",
  ].join("\n")

  if (process.env.DRY_RUN === "1") {
    console.log(body)
    return
  }

  const token = process.env.GITHUB_TOKEN
  const owner = process.env.CIRCLE_PROJECT_USERNAME
  const repo = process.env.CIRCLE_PROJECT_REPONAME
  const prNumber = parsePrNumber()

  if (!token) throw new Error("GITHUB_TOKEN is required")
  if (!owner || !repo) {
    throw new Error("CIRCLE_PROJECT_USERNAME and CIRCLE_PROJECT_REPONAME are required")
  }
  if (!prNumber) {
    console.log("Not a PR build (no CIRCLE_PULL_REQUEST). Skipping comment.")
    return
  }

  const existing = await findExistingComment({ token, owner, repo, prNumber })
  if (existing) {
    await ghRequest({
      method: "PATCH",
      path: `/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      token,
      body: { body },
    })
    console.log(`Updated existing comment #${existing.id} on PR #${prNumber}`)
  } else {
    const created = await ghRequest({
      method: "POST",
      path: `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      token,
      body: { body },
    })
    console.log(`Posted new comment #${created?.id} on PR #${prNumber}`)
  }
}

const ITERATIONS_NOTE = `iterations: ${process.env.BENCHMARK_ITERATIONS || 20}`

main().catch((err) => {
  console.error("post-benchmark-comment failed:", err?.message ?? err)
  // The comment is a nice-to-have. Don't fail the workflow on token / network
  // issues — the ci-gate job is what enforces test results.
  process.exit(0)
})
