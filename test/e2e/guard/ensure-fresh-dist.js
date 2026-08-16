// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

/**
 * Fresh-build guard for the e2e / consumer-contract suite.
 *
 * Spec: library-test-coverage — Task 7.1.
 * Requirement 11.4: the e2e suite SHALL depend on a fresh build and SHALL NOT
 * rely on a stale `dist/`.
 *
 * This script is intentionally plain CommonJS (no TypeScript / no transform) so it
 * can run as a `pretest:e2e` npm hook with zero build dependencies — it must be the
 * thing that *protects* the build, so it cannot itself need a build to run.
 *
 * It enforces two invariants, failing fast (exit code 1) with an actionable message:
 *
 *   1. EXISTENCE — the published contract artifacts resolved from `package.json`
 *      (`main` → `dist/bundle.js`, `types` → `dist/src/index.d.ts`) must exist.
 *
 *   2. FRESHNESS — no relevant build *input* may be newer than the *oldest* built
 *      artifact. Build inputs are the runtime sources plus the build configuration
 *      (`src/**`, `package.json`, `tsconfig*.json`, `bin/esbuild/**`). If any input
 *      has a newer mtime than the artifacts, `dist/` is stale and a rebuild is
 *      required before the consumer-contract tests can be trusted.
 *
 * This is a guard, NOT a builder: it never rebuilds. On failure it instructs the
 * caller to run `yarn build`.
 *
 * @module ensure-fresh-dist
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Repo root resolved relative to this file: test/e2e/guard/ → ../../../ */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Build the canonical rebuild instruction shown on every failure. */
const REBUILD_HINT = 'Run `yarn build` before `yarn test:e2e`.';

/**
 * Read and parse the package manifest.
 *
 * @returns {{ main?: string, types?: string }} parsed package.json
 */
function readManifest() {
  const manifestPath = path.join(REPO_ROOT, 'package.json');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Resolve the absolute paths of the published contract artifacts from the manifest.
 * Resolving from `main`/`types` (rather than hard-coding `dist/...`) ties the guard
 * to the *actual* consumer contract a published package exposes.
 *
 * @param {{ main?: string, types?: string }} manifest
 * @returns {{ label: string, absPath: string }[]}
 */
function resolveContractArtifacts(manifest) {
  const artifacts = [];

  if (typeof manifest.main === 'string' && manifest.main.length > 0) {
    artifacts.push({ label: `main (${manifest.main})`, absPath: path.resolve(REPO_ROOT, manifest.main) });
  } else {
    fail(`package.json "main" is not defined; cannot locate the built runtime entry. ${REBUILD_HINT}`);
  }

  if (typeof manifest.types === 'string' && manifest.types.length > 0) {
    artifacts.push({ label: `types (${manifest.types})`, absPath: path.resolve(REPO_ROOT, manifest.types) });
  } else {
    fail(`package.json "types" is not defined; cannot locate the built type entry. ${REBUILD_HINT}`);
  }

  return artifacts;
}

/**
 * Recursively collect file paths under a directory, skipping nothing (caller passes
 * already-scoped roots). Non-existent roots are ignored.
 *
 * @param {string} rootDir absolute directory path
 * @returns {string[]} absolute file paths
 */
function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

/**
 * Compute the newest modification time (ms) among the provided files.
 *
 * @param {string[]} files absolute file paths
 * @returns {{ mtimeMs: number, file: string } | null} newest entry, or null if empty
 */
function newestMtime(files) {
  /** @type {{ mtimeMs: number, file: string } | null} */
  let newest = null;
  for (const file of files) {
    const { mtimeMs } = fs.statSync(file);
    if (newest === null || mtimeMs > newest.mtimeMs) {
      newest = { mtimeMs, file };
    }
  }
  return newest;
}

/**
 * Gather all relevant build INPUTS whose modification invalidates `dist/`.
 * Runtime sources plus the build configuration (so a config/build change also
 * correctly flags the existing `dist/` as stale).
 *
 * @returns {string[]} absolute input file paths
 */
function collectBuildInputs() {
  const inputs = [];

  // Runtime sources (the bundled library) — excluding co-located tests which do
  // not participate in the build and would otherwise force spurious staleness.
  const srcFiles = collectFiles(path.join(REPO_ROOT, 'src')).filter(
    (file) => !file.endsWith('.test.ts'),
  );
  inputs.push(...srcFiles);

  // Build configuration inputs.
  inputs.push(...collectFiles(path.join(REPO_ROOT, 'bin', 'esbuild')));

  for (const configName of ['package.json', 'tsconfig.json']) {
    const configPath = path.join(REPO_ROOT, configName);
    if (fs.existsSync(configPath)) {
      inputs.push(configPath);
    }
  }

  return inputs;
}

/**
 * Emit a failure message to stderr and exit with a non-zero status (fail fast).
 *
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`\n[e2e:guard] STALE/MISSING BUILD — ${message}\n\n`);
  process.exit(1);
}

/**
 * Guard entrypoint: verify existence then freshness of the built artifacts.
 *
 * @returns {void}
 */
function main() {
  const manifest = readManifest();
  const artifacts = resolveContractArtifacts(manifest);

  // --- Invariant 1: EXISTENCE -------------------------------------------------
  const missing = artifacts.filter((artifact) => !fs.existsSync(artifact.absPath));
  if (missing.length > 0) {
    const list = missing.map((artifact) => `  - ${artifact.label}`).join('\n');
    fail(`required build artifact(s) not found:\n${list}\n${REBUILD_HINT}`);
  }

  // --- Invariant 2: FRESHNESS -------------------------------------------------
  // The OLDEST artifact must be at least as new as the NEWEST build input.
  const artifactMtimes = artifacts.map((artifact) => ({
    label: artifact.label,
    mtimeMs: fs.statSync(artifact.absPath).mtimeMs,
  }));
  const oldestArtifact = artifactMtimes.reduce((oldest, current) =>
    current.mtimeMs < oldest.mtimeMs ? current : oldest,
  );

  const newestInput = newestMtime(collectBuildInputs());
  if (newestInput !== null && newestInput.mtimeMs > oldestArtifact.mtimeMs) {
    const rel = path.relative(REPO_ROOT, newestInput.file);
    fail(
      `build input is newer than the built artifact:\n` +
      `  - newest input:   ${rel}\n` +
      `  - oldest artifact: ${oldestArtifact.label}\n` +
      `${REBUILD_HINT}`,
    );
  }

  process.stdout.write('[e2e:guard] dist/ is present and fresh — proceeding with e2e suite.\n');
}

main();
