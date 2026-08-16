// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as ts from 'typescript';

/**
 * E2E / consumer-contract spec — README code-block CONTRACT.
 *
 * Spec: library-test-coverage — README documentation contract.
 *
 * Critical guarantee: EVERY TypeScript example published in `README.md` must compile
 * VERBATIM (character-for-character) against the BUILT public declarations
 * (`dist/src/index.d.ts`), exactly as an external consumer who copy-pastes the example
 * would experience it. A README example that does not type-check is, by definition, a
 * documentation defect: the README is wrong and must be corrected — never the example
 * silently "adapted" inside the test.
 *
 * How the contract is enforced:
 *  1. The raw `README.md` is read from the repository root.
 *  2. Every fenced ```` ```typescript ```` / ```` ```ts ```` block is extracted with its
 *     exact source text and its 1-based start line (for precise failure attribution).
 *  3. Each block is written UNMODIFIED to its own temporary `.ts` file and compiled in
 *     isolation against the consumer tsconfig (`tsconfig.e2e.json`), which maps
 *     `@worktif/utils` → `dist/src/index.d.ts` and exposes NO `src/` path aliases.
 *  4. The block passes iff it produces ZERO consumer diagnostics.
 *
 * Each block is compiled in its own program so that identical identifiers across
 * examples (e.g. `appLogger`, `OrderService`) never collide. A fresh build is enforced
 * by the `pretest:e2e` guard, so the declarations under test are always current.
 *
 * Policy note (npm package documentation): the contract intentionally targets ONLY
 * ```` ```typescript ```` / ```` ```ts ```` fences — the blocks a consumer is meant to
 * copy and run. Illustrative, non-runnable listings (shell output, JSON samples, type
 * shapes) use other fence languages and are out of scope by design.
 */

/** Repository root (two levels up from `test/e2e`). */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Repository-root README under contract. */
const README_PATH = path.join(REPO_ROOT, 'README.md');

/** Built runtime entry an external consumer resolves `@worktif/utils` to (package `main`). */
const BUILT_BUNDLE = path.join(REPO_ROOT, 'dist', 'bundle.js');

/** The published package specifier the examples import from. */
const PACKAGE_SPECIFIER = '@worktif/utils';

/** Isolated consumer tsconfig (maps `@worktif/utils` → built declaration entry). */
const E2E_TSCONFIG = path.resolve(__dirname, 'tsconfig.e2e.json');

/** Fence languages treated as copy-runnable, compile-checked TypeScript. */
const CHECKED_LANGUAGES: ReadonlySet<string> = new Set(['typescript', 'ts']);

/** A single extracted README code block. */
interface ReadmeBlock {
  /** 1-based index among all checked blocks (stable, human-friendly). */
  readonly ordinal: number;
  /** Fence language tag (e.g. `typescript`). */
  readonly language: string;
  /** 1-based line in README.md where the opening fence sits. */
  readonly startLine: number;
  /** Exact, verbatim block body (no surrounding fences). */
  readonly code: string;
}

/**
 * Extract every fenced code block from markdown, preserving the verbatim body and the
 * 1-based opening-fence line. A simple, deterministic line scanner is used (rather than
 * a regex) so nested back-tick artifacts and indentation are handled predictably.
 *
 * @param markdown raw markdown source
 * @returns all checked (`typescript`/`ts`) blocks in document order
 */
function extractCheckedBlocks(markdown: string): readonly ReadmeBlock[] {
  const lines = markdown.split('\n');
  const blocks: ReadmeBlock[] = [];

  let ordinal = 0;
  let inFence = false;
  let fenceLanguage = '';
  let fenceStartLine = 0;
  let body: string[] = [];

  const fencePattern = /^\s*```([A-Za-z0-9_-]*)\s*$/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = fencePattern.exec(line);

    if (match !== null && !inFence) {
      // Opening fence.
      inFence = true;
      fenceLanguage = match[1].toLowerCase();
      fenceStartLine = index + 1;
      body = [];
      continue;
    }

    if (match !== null && inFence) {
      // Closing fence.
      if (CHECKED_LANGUAGES.has(fenceLanguage)) {
        ordinal += 1;
        blocks.push({
          ordinal,
          language: fenceLanguage,
          startLine: fenceStartLine,
          code: body.join('\n'),
        });
      }
      inFence = false;
      fenceLanguage = '';
      body = [];
      continue;
    }

    if (inFence) {
      body.push(line);
    }
  }

  return blocks;
}

/**
 * Parse `tsconfig.e2e.json` into concrete compiler options, exactly as a consumer's
 * build would read its own tsconfig.
 *
 * @returns parsed compiler options for the isolated consumer config
 */
function loadConsumerCompilerOptions(): ts.CompilerOptions {
  const configFile = ts.readConfigFile(E2E_TSCONFIG, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      `Failed to read ${E2E_TSCONFIG}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(E2E_TSCONFIG),
  );
  // `noEmit` keeps the contract a pure type-check; we never produce output.
  return { ...parsed.options, noEmit: true };
}

/**
 * Diagnostics attributable to the consumer's own code (the temp block file or global
 * options), excluding library declarations under `dist/` and dependencies under
 * `node_modules/`. A README defect is one a copy-pasting consumer would actually see.
 *
 * @param diagnostics full pre-emit diagnostics
 * @param blockFile absolute path of the temp file holding the block
 * @returns consumer-attributable diagnostics only
 */
function consumerDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  blockFile: string,
): readonly ts.Diagnostic[] {
  const normalizedBlock = blockFile.replace(/\\/g, '/');
  return diagnostics.filter((diagnostic) => {
    const fileName = (diagnostic.file?.fileName ?? '').replace(/\\/g, '/');
    if (fileName.length === 0) {
      // Global / options diagnostics — surface them.
      return true;
    }
    if (fileName.includes('/node_modules/') || fileName.includes('/dist/')) {
      return false;
    }
    return fileName === normalizedBlock;
  });
}

/**
 * Render a diagnostic as a single readable line with its in-block position, so a
 * failing example points the maintainer straight at the offending line.
 *
 * @param diagnostic a TypeScript diagnostic
 * @param block the README block the diagnostic belongs to
 * @returns a human-readable, README-attributed message
 */
function formatDiagnostic(diagnostic: ts.Diagnostic, block: ReadmeBlock): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file && typeof diagnostic.start === 'number') {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    // Map the in-file line back to the README line: block body starts on the line
    // AFTER the opening fence, hence `+ 1`.
    const readmeLine = block.startLine + 1 + line;
    return `README.md:${readmeLine}:${character + 1} — TS${diagnostic.code}: ${message}`;
  }
  return `TS${diagnostic.code}: ${message}`;
}

describe('README contract: every TypeScript example compiles against the built package', () => {
  const compilerOptions = loadConsumerCompilerOptions();
  const markdown = fs.readFileSync(README_PATH, 'utf8');
  const blocks = extractCheckedBlocks(markdown);

  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktif-readme-contract-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts at least one copy-runnable TypeScript example from README.md', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('resolves the built declaration entry the examples are checked against', () => {
    const declarationEntry = path.resolve(__dirname, '..', '..', 'dist', 'src', 'index.d.ts');
    expect(fs.existsSync(declarationEntry)).toBe(true);
  });

  // One isolated, fully-attributed compilation per README block. `test.each` keeps each
  // example a discrete, individually-reported case so a single broken snippet names
  // itself (with its README line) instead of collapsing the whole suite.
  it.each(blocks.map((block) => [block.ordinal, block.startLine, block] as const))(
    'README example #%i (README.md:%i) compiles with no consumer type errors',
    (_ordinal, _startLine, block) => {
      const blockFile = path.join(tempDir, `readme-block-${block.ordinal}.ts`);
      fs.writeFileSync(blockFile, block.code, 'utf8');

      const program = ts.createProgram([blockFile], compilerOptions);
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const errors = consumerDiagnostics(diagnostics, blockFile);

      const formatted = errors.map((diagnostic) => formatDiagnostic(diagnostic, block));
      expect(formatted).toEqual([]);
    },
  );
});

/**
 * Determine whether a block is a runnable PROGRAM (it imports the published package),
 * as opposed to an inert fragment. Only runnable programs are executed.
 *
 * @param block a README block
 * @returns true if the block imports `@worktif/utils`
 */
function isRunnableProgram(block: ReadmeBlock): boolean {
  return block.code.includes(PACKAGE_SPECIFIER);
}

/**
 * Transpile a README TypeScript block to CommonJS and rewrite the published package
 * specifier to the ABSOLUTE built bundle path, so the example executes against exactly
 * the artifact `npm install` would resolve (`package.json` `main` → `dist/bundle.js`).
 *
 * @param block the README block to prepare for execution
 * @returns runnable CommonJS source
 */
function toRunnableJs(block: ReadmeBlock): string {
  const transpiled = ts.transpileModule(block.code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;

  // Rewrite every `require("@worktif/utils")` to the absolute built-bundle path. The
  // specifier only ever appears inside a require() string after transpilation.
  const bundlePathLiteral = JSON.stringify(BUILT_BUNDLE);
  return transpiled.split(JSON.stringify(PACKAGE_SPECIFIER)).join(bundlePathLiteral);
}

describe('README contract: every runnable TypeScript example executes against the built bundle', () => {
  const markdown = fs.readFileSync(README_PATH, 'utf8');
  const runnableBlocks = extractCheckedBlocks(markdown).filter(isRunnableProgram);

  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktif-readme-run-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('finds runnable README programs to execute', () => {
    expect(runnableBlocks.length).toBeGreaterThan(0);
  });

  // Each runnable example is executed in its OWN child `node` process (full isolation,
  // exactly as a consumer running the snippet would). "Works" == exit code 0 with no
  // thrown error; a non-zero exit attaches the example's stderr for triage.
  it.each(runnableBlocks.map((block) => [block.ordinal, block.startLine, block] as const))(
    'README example #%i (README.md:%i) runs without throwing',
    (_ordinal, _startLine, block) => {
      const scriptFile = path.join(tempDir, `readme-run-${block.ordinal}.cjs`);
      fs.writeFileSync(scriptFile, toRunnableJs(block), 'utf8');

      let failure: string | undefined;
      try {
        // `cwd: REPO_ROOT` + `NODE_PATH` let the example resolve peer deps
        // (reflect-metadata, etc.) from the package's own node_modules, mirroring a
        // real install. The temp script lives in the OS tmpdir, so bare-specifier
        // resolution needs NODE_PATH to reach the repository's node_modules.
        execFileSync(process.execPath, [scriptFile], {
          cwd: REPO_ROOT,
          stdio: ['ignore', 'ignore', 'pipe'],
          timeout: 20000,
          env: { ...process.env, NODE_PATH: path.join(REPO_ROOT, 'node_modules') },
        });
      } catch (error) {
        const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
        const message = (error as Error).message ?? String(error);
        failure = `README.md:${block.startLine} example threw on execution:\n${stderr || message}`;
      }

      expect(failure).toBeUndefined();
    },
  );
});
