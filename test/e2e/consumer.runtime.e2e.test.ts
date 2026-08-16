// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

/**
 * E2E / consumer-contract spec — public RUNTIME export resolution.
 *
 * Spec: library-test-coverage — Task 7.2.
 * Validates: Requirement 11.1 (importing via `package.json` `main` resolves the
 * documented public runtime exports).
 *
 * This spec is a black-box consumer test: it `require`s the package by its PUBLISHED
 * specifier `@worktif/utils`, which the Jest `e2e` project maps to the repo root so
 * the resolver reads `package.json` `main` (→ `dist/bundle.js`) — exactly as an
 * external consumer's `npm install` would wire it. There is NO `src/` import and NO
 * `@core/*` / `@utils/*` path alias in scope. A fresh build is enforced by the
 * `pretest:e2e` guard.
 *
 * The documented runtime contract below is the authoritative, TypeDoc-published set
 * of value-level exports (enums, classes, variables, functions) from the library's
 * generated API surface (`.docs/globals.md`). Type-only exports (interfaces, type
 * aliases) are erased at runtime and are asserted separately by the type-surface
 * spec (Property 24).
 */

/**
 * `require` the built package as an external consumer would. Resolved via the Jest
 * `e2e` project's `moduleNameMapper` (`@worktif/utils` → repo root → `main`).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg: Record<string, unknown> = require('@worktif/utils');

/**
 * Documented public exports that MUST be callable/constructable at runtime
 * (`typeof === 'function'`): every public class and standalone function.
 */
const FUNCTION_EXPORTS: readonly string[] = [
  // Classes.
  'Bundle',
  'PureContainer',
  'EnvConfigDefault',
  'PureLazyInstance',
  'CustomException',
  'LoggerLogsFormatter',
  'RuntimeLoggerFormatter',
  'LoggerCliPluginExt',
  'LoggerCliPlugin',
  'Serializer',
  'ApiSerializer',
  'GraphqlSerializer',
  'SerializerUtils',
  // Functions.
  'validateWebsiteStage',
  'composeApiResponse',
  'omitInternally',
  'capitalizeFirstLetters',
  'error',
  'completePromiseSettled',
  'intersection',
  'catchInjector',
  'loggerInjector',
  'injectAfter',
  'injectBefore',
  'purable',
  'pure',
  'AutoParamTypes',
  'MetaClassName',
  'composeFactoryBind',
  'suggestFormatterByEnvironment',
  '_setExpectEmptyJson',
  'mapOptionsToSerializer',
  'mapOptionsToAsyncSerializer',
  'logger',
  'initLog',
  'execAction',
  'stop',
  'defineLogType',
  'writeLog',
  'dateNow',
  'identityToNull',
  'identityToVoid',
  'identity',
  '_identity',
];

/**
 * Documented public enums. TypeScript enums (including the `const enum Di`, which the
 * production bundler preserves as a runtime object) materialize as non-null objects.
 */
const ENUM_EXPORTS: readonly string[] = [
  'WebsiteStage',
  'PromiseSettledStatus',
  'TypeDefTypes',
  'Di',
  'CustomErrorType',
  'RuntimeLogFormatterProvider',
  'LoggerLevel',
];

/**
 * Documented public variables. Their runtime VALUES are intentionally not asserted
 * here (some are deliberately falsy — e.g. `EMPTY_STRING === ''`, `EMPTY_NUMBER === 0`,
 * `isBrowser === false`); only their PRESENCE on the export surface is part of the
 * contract, so the assertion is membership (`name in pkg`), not truthiness.
 */
const VARIABLE_EXPORTS: readonly string[] = [
  'bundle',
  'envConfigSchemaDefault',
  'envConfigSchemaSupport',
  'DEFAULT_AWS_REGION',
  'EMPTY_STRING',
  'UNDERSCORE',
  'EMPTY_NUMBER',
  'SLASH',
  'DASH',
  'DOT',
  'SEMICOLUMN',
  'SPACE',
  'COMMA',
  'isBrowser',
  'TYPE_DEF_PREFIX',
  'loggerSerializers',
  'EMPTY_LINE',
  'ANSI_FG_RED',
  'ANSI_FG_YELLOW',
  'ANSI_FG_GREEN',
  'ANSI_FG_NC',
  'DEFAULT_LOG_LEVEL',
  'LOGGER_INFO_OPTION_NAME',
];

/** The full documented runtime contract (used for completeness assertions). */
const ALL_RUNTIME_EXPORTS: readonly string[] = [
  ...FUNCTION_EXPORTS,
  ...ENUM_EXPORTS,
  ...VARIABLE_EXPORTS,
];

describe('E2E consumer-contract: public runtime export resolution (Requirement 11.1)', () => {
  it('resolves the built package via package.json "main"', () => {
    expect(pkg).toBeDefined();
    expect(typeof pkg).toBe('object');
  });

  it('exposes every documented callable/constructable export as a function', () => {
    const notFunctions = FUNCTION_EXPORTS.filter((name) => typeof pkg[name] !== 'function');
    expect(notFunctions).toEqual([]);
  });

  it('exposes every documented enum as a non-null runtime object', () => {
    const badEnums = ENUM_EXPORTS.filter(
      (name) => typeof pkg[name] !== 'object' || pkg[name] === null,
    );
    expect(badEnums).toEqual([]);
  });

  it('exposes every documented variable on the export surface', () => {
    const missing = VARIABLE_EXPORTS.filter((name) => !(name in pkg));
    expect(missing).toEqual([]);
  });

  /**
   * Property 23: Public runtime export resolution.
   *
   * **Feature: library-test-coverage, Property 23: Public runtime export resolution**
   * **Validates: Requirements 11.1**
   *
   * For ANY documented public runtime export, importing the built package via `main`
   * resolves it to a defined value of the contracted runtime kind: functions/classes
   * are callable (`typeof === 'function'`), enums are non-null objects, and variables
   * are present on the surface. Sampling the contract with `fast-check` (shrinking
   * enabled) asserts the property holds across the entire documented surface.
   */
  it('Property 23: importing via main resolves all documented public runtime exports', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_RUNTIME_EXPORTS), (name) => {
        // Every documented runtime export must exist on the resolved package.
        if (!(name in pkg)) {
          return false;
        }

        if (FUNCTION_EXPORTS.includes(name)) {
          return typeof pkg[name] === 'function';
        }
        if (ENUM_EXPORTS.includes(name)) {
          return typeof pkg[name] === 'object' && pkg[name] !== null;
        }
        // Variables: presence is the contract (values may be intentionally falsy).
        return true;
      }),
      { numRuns: 100, endOnFailure: false },
    );
  });
});
