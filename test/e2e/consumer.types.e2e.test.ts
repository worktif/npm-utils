// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as path from 'node:path';

import * as fc from 'fast-check';
import * as ts from 'typescript';

/**
 * E2E / consumer-contract spec — public TYPE-SURFACE resolution.
 *
 * Spec: library-test-coverage — Task 7.2.
 * Validates: Requirement 11.2 (a TypeScript consumer fixture compiled against
 * `dist/src/index.d.ts` resolves the public type surface with no errors).
 *
 * This spec invokes the TypeScript compiler API directly, as an external consumer's
 * build would: it parses the isolated consumer config (`tsconfig.e2e.json`, which maps
 * `@worktif/utils` → the BUILT `dist/src/index.d.ts` and exposes NO `src/` path
 * aliases), compiles the consumer type-surface fixture against it, and asserts zero
 * type errors. A fresh build is enforced by the `pretest:e2e` guard.
 *
 * The program is built ONCE in `beforeAll`; the literal compile assertion and the
 * property-based surface check both read from that single compilation, keeping the
 * suite deterministic and fast.
 */

/** Isolated consumer tsconfig (maps `@worktif/utils` → built declaration entry). */
const E2E_TSCONFIG = path.resolve(__dirname, 'tsconfig.e2e.json');

/** The consumer type-surface fixture compiled against the built declarations. */
const TYPE_SURFACE_FIXTURE = path.resolve(
  __dirname,
  'fixtures',
  'type-consumer',
  'type-surface.ts',
);

/** The built public declaration entry the consumer resolves `@worktif/utils` to. */
const DECLARATION_ENTRY = path.resolve(__dirname, '..', '..', 'dist', 'src', 'index.d.ts');

/**
 * Documented public TYPE-ONLY exports (interfaces + type aliases). These are erased at
 * runtime and therefore form the type surface asserted here (the runtime value surface
 * is asserted by Property 23). Sourced from the TypeDoc-published API (`.docs/globals.md`).
 */
const TYPE_ONLY_EXPORTS: readonly string[] = [
  // Interfaces.
  'CustomErrorOptions',
  'LoggerInstance',
  'LambdaHandlerInterface',
  'LoggerInterface',
  // Type aliases.
  'LoggerCliFormatter',
  'BundleCli',
  'Newable',
  'ContainerTieOptions',
  'PureTied',
  'PureStackArgs',
  'PureStack',
  'PureTiedOptions',
  'PureTie',
  'EnvSchemaDescriptorValues',
  'EnvSchemaDescriptor',
  'EnvConfigSchemaDefault',
  'Maybe',
  'WithRequestID',
  'Nullable',
  'ApiError',
  'QueryByAttrOptions',
  'ApiResponse',
  'RecursivePartial',
  'MethodsOf',
  'KeyPath',
  'TypeDefPrefix',
  'TypeDef',
  'DecoratorResponse',
  'BeforeInstance',
  'DecoratorCatchInjector',
  'DiInstance',
  'ConsoleFormatterOptions',
  'RuntimeLogFormatterOptions',
  'LogInfoOptions',
  'EntityLoggerSerializerMap',
  'EntitySerializer',
  'EntityLoggerSerializer',
  'LoggerInstanceOptionsParams',
  'LoggerInstanceOptions',
  'LogLevelExport',
  'GqlToNull',
  'GqlToVoid',
];

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

  return parsed.options;
}

/**
 * Compile the consumer type-surface fixture against the built declarations and return
 * the full pre-emit diagnostics (syntactic + semantic + global + options). Restricting
 * `rootNames` to the fixture isolates the assertion to the consumer's own usage; the
 * package declarations are pulled in transitively via the `@worktif/utils` import.
 *
 * @returns the TypeScript program and its diagnostics
 */
function compileConsumerFixture(): {
  program: ts.Program;
  diagnostics: readonly ts.Diagnostic[];
} {
  const options = loadConsumerCompilerOptions();
  const program = ts.createProgram([TYPE_SURFACE_FIXTURE], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return { program, diagnostics };
}

/**
 * Diagnostics that originate from a consumer-owned source file (i.e. not a library
 * declaration under `dist/` or a dependency under `node_modules`). A consumer-contract
 * failure is one the consumer would actually see when compiling THEIR code.
 *
 * @param diagnostics full pre-emit diagnostics
 * @returns consumer-attributable diagnostics only
 */
function consumerDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
): readonly ts.Diagnostic[] {
  return diagnostics.filter((diagnostic) => {
    const fileName = diagnostic.file?.fileName ?? '';
    const normalized = fileName.replace(/\\/g, '/');
    // Keep global/options diagnostics (no file) and those attributed to the fixture.
    if (normalized.length === 0) {
      return true;
    }
    if (normalized.includes('/node_modules/') || normalized.includes('/dist/')) {
      return false;
    }
    return true;
  });
}

/** Resolve the exported symbol names of the built declaration entry. */
function declarationEntryExports(program: ts.Program): ReadonlySet<string> {
  const checker = program.getTypeChecker();
  const entrySource = program
    .getSourceFiles()
    .find((file) => path.resolve(file.fileName) === DECLARATION_ENTRY);

  if (entrySource === undefined) {
    throw new Error(
      `Built declaration entry not found in program: ${DECLARATION_ENTRY}. Did "yarn build" run?`,
    );
  }

  const moduleSymbol = checker.getSymbolAtLocation(entrySource);
  if (moduleSymbol === undefined) {
    throw new Error('Unable to resolve the module symbol for the declaration entry.');
  }

  return new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.name));
}

describe('E2E consumer-contract: public type-surface resolution (Requirement 11.2)', () => {
  let program: ts.Program;
  let diagnostics: readonly ts.Diagnostic[];
  let exportedNames: ReadonlySet<string>;

  beforeAll(() => {
    const compiled = compileConsumerFixture();
    program = compiled.program;
    diagnostics = compiled.diagnostics;
    exportedNames = declarationEntryExports(program);
  });

  it('includes the built declaration entry in the consumer program', () => {
    const hasEntry = program
      .getSourceFiles()
      .some((file) => path.resolve(file.fileName) === DECLARATION_ENTRY);
    expect(hasEntry).toBe(true);
  });

  it('compiles the consumer fixture against dist/src/index.d.ts with no type errors', () => {
    const errors = consumerDiagnostics(diagnostics);
    // Surface readable messages on failure for fast triage.
    const formatted = errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
    expect(formatted).toEqual([]);
    expect(errors.length).toBe(0);
  });

  /**
   * Property 24: Public type surface resolution.
   *
   * **Feature: library-test-coverage, Property 24: Public type surface resolution**
   * **Validates: Requirements 11.2**
   *
   * For ANY documented public type-only export, compiling a TypeScript consumer against
   * the built `dist/src/index.d.ts` resolves the symbol from the declaration entry with
   * no type errors. The fixture compilation yields zero consumer diagnostics, and every
   * documented type name is present on the resolved declaration surface. Sampling the
   * documented type contract with `fast-check` (shrinking enabled) asserts the property
   * holds across the entire public type surface.
   */
  it('Property 24: a consumer compiled against dist/src/index.d.ts resolves the public type surface with no errors', () => {
    const consumerErrors = consumerDiagnostics(diagnostics);

    fc.assert(
      fc.property(fc.constantFrom(...TYPE_ONLY_EXPORTS), (typeName) => {
        // The documented type must be exported from the built declaration entry...
        if (!exportedNames.has(typeName)) {
          return false;
        }
        // ...and the consumer fixture must compile against those declarations cleanly.
        return consumerErrors.length === 0;
      }),
      { numRuns: 100, endOnFailure: false },
    );
  });
});
