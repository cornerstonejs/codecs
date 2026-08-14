#!/usr/bin/env node
//
// Independent, conventional-commit versioning for the codecs workspace.
//
// This replaces `lerna version` (the repo dropped lerna for pnpm). It is
// deliberately file-mutation only: it rewrites package.json versions,
// dependency ranges and CHANGELOG.md files, then writes a machine-readable
// plan to release-plan.json. Every git write (commit, tag, push) stays in
// .github/workflows/release.yml, so this script can be run locally against a
// dirty tree with --dry-run to see exactly what a release would do.
//
// Behaviour it preserves from the old lerna.json config:
//   - independent versions, one `<name>@<version>` tag per package
//   - bump chosen from conventional commits touching that package's directory
//   - commits touching only ignoreChanges paths do not trigger a release
//   - dependents get their caret range bumped plus a patch release
//   - CHANGELOG.md entries in the same format lerna's conventional-changelog
//     preset produced, so old and new entries read alike
//
// Usage:
//   node tools/release/version.mjs [--dry-run] [--json]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const REPO_URL = 'https://github.com/cornerstonejs/codecs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const PLAN_FILE = path.join(ROOT, 'release-plan.json');
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const asJson = argv.includes('--json');

const log = (...args) => {
  if (!asJson) {
    console.log(...args);
  }
};

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ---------------------------------------------------------------------------
// Workspace discovery
// ---------------------------------------------------------------------------

function readWorkspace() {
  const packages = new Map();

  for (const dir of fs.readdirSync(PACKAGES_DIR).sort()) {
    const manifestPath = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      // e.g. packages/libjxl, which carries build output but no manifest.
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.private || !manifest.name || !manifest.version) {
      continue;
    }

    packages.set(manifest.name, { name: manifest.name, dir, manifestPath, manifest });
  }

  return packages;
}

// ---------------------------------------------------------------------------
// Conventional commit analysis
// ---------------------------------------------------------------------------

/**
 * Newest `<name>@<version>` tag for a package, by semver order rather than tag
 * creation date — a re-pushed or back-filled tag must not become the baseline.
 */
function lastReleaseTag(name) {
  const prefix = `${name}@`;
  const tags = git('tag', '--list', `${prefix}*`)
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, version: tag.slice(prefix.length) }))
    .filter((t) => semver.valid(t.version));

  if (!tags.length) {
    return null;
  }

  tags.sort((a, b) => semver.rcompare(a.version, b.version));
  return tags[0].tag;
}

// ASCII unit/record separators. Commit bodies contain newlines and blank
// lines, so any printable delimiter would eventually collide with a real
// commit message. NUL is not an option: it cannot survive an argv string.
const COMMIT_SEP = String.fromCharCode(0x1f); // git emits it as %x1f
const RECORD_SEP = String.fromCharCode(0x1e); // git emits it as %x1e

// Carried over verbatim from lerna.json's command.publish.ignoreChanges. That
// key looked like it applied only to `lerna publish`, but VersionCommand
// declares publish as an "other command config" and read it too — so this is
// what stopped a docs-only commit from releasing all eight packages. A commit
// counts as releasable only if it touches at least one path these globs do
// NOT match.
const IGNORE_CHANGES = ['*.md', '*.yml', '*.spec.js', '*.test.js'];

/**
 * minimatch's `matchBase` behaviour for the simple globs above: a pattern with
 * no slash is tested against the basename, at any depth.
 */
function globToRegExp(glob) {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}$`);
}

const IGNORE_PATTERNS = IGNORE_CHANGES.map((glob) => ({
  matchesBasename: !glob.includes('/'),
  regexp: globToRegExp(glob),
}));

function isIgnoredPath(filePath) {
  const basename = filePath.slice(filePath.lastIndexOf('/') + 1);
  return IGNORE_PATTERNS.some(({ matchesBasename, regexp }) =>
    regexp.test(matchesBasename ? basename : filePath)
  );
}

/** Paths a commit touched inside one package directory. */
function commitPaths(hash, dir) {
  return git('show', '--pretty=format:', '--name-only', hash, '--', `packages/${dir}`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Commits touching packages/<dir> since the package's last release tag. */
function commitsSince(tag, dir) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git(
    'log',
    range,
    '--format=%H%x1f%s%x1f%b%x1e',
    '--no-merges',
    '--',
    `packages/${dir}`
  );

  return (
    raw
      .split(RECORD_SEP)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [hash, subject, body = ''] = entry.split(COMMIT_SEP);
        return { hash, subject, body };
      })
      // Release commits are bookkeeping, not changes worth releasing again.
      .filter((c) => !c.subject.startsWith('chore(release):'))
      // A commit that touched only ignored paths (docs, workflows, tests) is
      // not a release. Without this a README pass ships eight npm versions
      // whose changelogs read only "Version bump only for package ...".
      .filter((c) => {
        const paths = commitPaths(c.hash, dir);
        return paths.length > 0 && !paths.every(isIgnoredPath);
      })
  );
}

const HEADER_RE = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<subject>.+)$/;

function parseCommit(commit) {
  const match = HEADER_RE.exec(commit.subject);
  const breaking = Boolean(match?.groups.breaking) || /^BREAKING[ -]CHANGE:/m.test(commit.body);

  return {
    hash: commit.hash,
    type: match?.groups.type?.toLowerCase() ?? null,
    scope: match?.groups.scope ?? null,
    subject: match?.groups.subject ?? commit.subject,
    breaking,
  };
}

/**
 * major on a breaking change, minor on any feat, patch on anything else.
 * Matches the conventional-commits preset lerna was configured with.
 */
function releaseTypeFor(commits) {
  if (!commits.length) {
    return null;
  }
  if (commits.some((c) => c.breaking)) {
    return 'major';
  }
  if (commits.some((c) => c.type === 'feat')) {
    return 'minor';
  }
  return 'patch';
}

// ---------------------------------------------------------------------------
// Changelog rendering
// ---------------------------------------------------------------------------

const CHANGELOG_HEADER = `# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
`;

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance Improvements'],
  ['revert', 'Reverts'],
];

function renderEntry({ name, previousVersion, nextVersion, commits, date }) {
  const heading = previousVersion
    ? `## [${nextVersion}](${REPO_URL}/compare/${name}@${previousVersion}...${name}@${nextVersion}) (${date})`
    : `## ${nextVersion} (${date})`;

  const lines = [heading, ''];

  const bullet = (c) => {
    const scope = c.scope ? `**${c.scope}:** ` : '';
    return `* ${scope}${c.subject} ([${c.hash.slice(0, 7)}](${REPO_URL}/commit/${c.hash}))`;
  };

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    lines.push('', '### BREAKING CHANGES', '', ...breaking.map(bullet));
  }

  for (const [type, title] of SECTIONS) {
    const matching = commits.filter((c) => c.type === type && !c.breaking);
    if (matching.length) {
      lines.push('', `### ${title}`, '', ...matching.map(bullet));
    }
  }

  // Cascade-only bumps (a dependency moved, this package did not) get lerna's
  // placeholder line so the entry is never empty. Note the single blank line,
  // where a section heading gets two — that is what lerna emitted.
  if (lines.length === 2) {
    lines.push(`**Note:** Version bump only for package ${name}`);
  }

  return `${lines.join('\n')}\n\n\n\n\n`;
}

function prependChangelog(dir, entry) {
  const changelogPath = path.join(PACKAGES_DIR, dir, 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    return { changelogPath, contents: `${CHANGELOG_HEADER}\n${entry}` };
  }

  const existing = fs.readFileSync(changelogPath, 'utf8');
  const firstEntry = existing.indexOf('\n## ');

  // Keep the file's own header block (its wording varies between packages) and
  // splice the new entry in above the most recent release.
  const contents =
    firstEntry === -1
      ? `${existing.trimEnd()}\n\n${entry}`
      : `${existing.slice(0, firstEntry + 1)}${entry}${existing.slice(firstEntry + 1)}`;

  return { changelogPath, contents };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function buildPlan(packages) {
  const bumps = new Map();

  for (const pkg of packages.values()) {
    const tag = lastReleaseTag(pkg.name);
    const commits = commitsSince(tag, pkg.dir).map(parseCommit);
    const releaseType = releaseTypeFor(commits);

    if (!releaseType) {
      log(`  ${pkg.name}: no releasable commits since ${tag ?? 'the beginning of history'}`);
      continue;
    }

    const previousVersion = pkg.manifest.version;
    bumps.set(pkg.name, {
      name: pkg.name,
      dir: pkg.dir,
      previousVersion,
      nextVersion: semver.inc(previousVersion, releaseType),
      releaseType,
      commits,
      reason: 'direct',
    });
  }

  // Cascade: a package depending on something that bumped needs a release of
  // its own carrying the widened range. Repeat to a fixpoint so a chain of
  // dependents all move in one release.
  for (;;) {
    let changed = false;

    for (const pkg of packages.values()) {
      if (bumps.has(pkg.name)) {
        continue;
      }

      const dependsOnBumped = DEP_FIELDS.some((field) =>
        Object.keys(pkg.manifest[field] ?? {}).some((dep) => bumps.has(dep))
      );

      if (dependsOnBumped) {
        bumps.set(pkg.name, {
          name: pkg.name,
          dir: pkg.dir,
          previousVersion: pkg.manifest.version,
          nextVersion: semver.inc(pkg.manifest.version, 'patch'),
          releaseType: 'patch',
          commits: [],
          reason: 'dependency',
        });
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return bumps;
}

function applyPlan(packages, bumps) {
  const date = new Date().toISOString().slice(0, 10);
  const writes = [];

  for (const bump of bumps.values()) {
    const pkg = packages.get(bump.name);
    const manifest = pkg.manifest;
    manifest.version = bump.nextVersion;

    for (const field of DEP_FIELDS) {
      const deps = manifest[field];
      if (!deps) {
        continue;
      }
      for (const dep of Object.keys(deps)) {
        const depBump = bumps.get(dep);
        if (depBump) {
          deps[dep] = `^${depBump.nextVersion}`;
        }
      }
    }

    writes.push({
      file: pkg.manifestPath,
      contents: `${JSON.stringify(manifest, null, 2)}\n`,
    });

    const entry = renderEntry({
      name: bump.name,
      previousVersion: bump.previousVersion,
      nextVersion: bump.nextVersion,
      commits: bump.commits,
      date,
    });
    const { changelogPath, contents } = prependChangelog(bump.dir, entry);
    writes.push({ file: changelogPath, contents });
  }

  if (dryRun) {
    return;
  }

  for (const { file, contents } of writes) {
    fs.writeFileSync(file, contents);
  }
}

function main() {
  const packages = readWorkspace();
  log(`Found ${packages.size} publishable packages.`);

  const bumps = buildPlan(packages);
  applyPlan(packages, bumps);

  const plan = [...bumps.values()].map((b) => ({
    name: b.name,
    dir: b.dir,
    previousVersion: b.previousVersion,
    version: b.nextVersion,
    releaseType: b.releaseType,
    reason: b.reason,
    tag: `${b.name}@${b.nextVersion}`,
  }));

  if (asJson) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (plan.length) {
    log('');
    log(dryRun ? 'Would release:' : 'Releasing:');
    for (const p of plan) {
      const why = p.reason === 'dependency' ? ' (dependency bump)' : '';
      log(`  ${p.name}: ${p.previousVersion} -> ${p.version} [${p.releaseType}]${why}`);
    }
  } else {
    log('');
    log('Nothing to release.');
  }

  if (!dryRun) {
    fs.writeFileSync(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  }
}

main();
