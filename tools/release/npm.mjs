// Spawning npm, correctly, on every platform the release scripts run on.
//
// Shared by publish.mjs and setup-trusted-publishing.mjs. Node builtins only —
// release.yml's publish job installs no dependencies on purpose (see its
// comments), so nothing in this directory may import from node_modules.
//
// Windows needs care twice over:
//
//   1. npm is a .cmd shim there, and since the fix for CVE-2024-27980 node
//      refuses to spawn .bat/.cmd without a shell — it fails with EINVAL. A
//      script that read that failure as "npm says no" would be badly wrong;
//      the first draft of publish.mjs did exactly that and reported all nine
//      published packages as brand-new.
//   2. Passing an args ARRAY together with `shell: true` is deprecated
//      (DEP0190) because the args are concatenated without escaping. So build
//      the one command string deliberately instead of letting node do it
//      silently. Every argument the callers pass is a fixed flag or a registry
//      spec — no spaces, no shell metacharacters, nothing from user input — so
//      concatenation is safe here, and `assertShellSafe` keeps it that way if
//      someone later passes something with a space in it.

import { spawnSync } from 'node:child_process';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NEEDS_SHELL = process.platform === 'win32';

function assertShellSafe(args) {
  for (const arg of args) {
    if (!/^[A-Za-z0-9@/._=-]+$/.test(arg)) {
      throw new Error(
        `refusing to pass ${JSON.stringify(arg)} to npm through a shell: ` +
          'it is not a plain flag or registry spec. Quote it properly, or spawn npm without a shell.'
      );
    }
  }
}

/**
 * Run npm and hand back the raw spawnSync result — status and stderr included,
 * so callers can tell an expected non-zero exit (a 404 from `npm view`) from a
 * genuine failure. Throws only when npm could not be started at all.
 */
export function runNpm(args, options = {}) {
  const spawnOptions = { encoding: 'utf8', ...options };

  const result = NEEDS_SHELL
    ? (assertShellSafe(args), spawnSync([NPM, ...args].join(' '), { ...spawnOptions, shell: true }))
    : spawnSync(NPM, args, spawnOptions);

  if (result.error) {
    throw new Error(`could not run \`npm ${args.join(' ')}\`: ${result.error.message}`);
  }

  return result;
}

/** npm's own version, e.g. "11.19.0". */
export function npmVersion() {
  const result = runNpm(['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status !== 0) {
    throw new Error(`\`npm --version\` failed with exit ${result.status}`);
  }

  return `${result.stdout}`.trim();
}

/**
 * Whether a registry spec resolves, distinguishing "npm says it is not there"
 * from "npm could not tell us".
 *
 * That distinction is a safety property, not pedantry: treating any non-zero
 * exit as "not published" turns a network blip or an expired session into
 * "this is a brand-new package", which is a conclusion the release acts on.
 */
export function resolvesOnRegistry(spec) {
  const result = runNpm(['view', spec, 'version'], { stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status === 0) {
    return true;
  }

  const stderr = `${result.stderr ?? ''}`;
  if (/E404|404 Not Found|is not in this registry/.test(stderr)) {
    return false;
  }

  throw new Error(
    `\`npm view ${spec} version\` failed with exit ${result.status}, and not with a 404. ` +
      `Refusing to guess whether it is published.\n${stderr.trim()}`
  );
}
