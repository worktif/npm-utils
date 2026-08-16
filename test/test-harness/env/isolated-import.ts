// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Loads a module (or any value derived from a fresh module registry) inside an
 * isolated Jest module scope, containing module-load side effects so they never
 * leak into other tests.
 *
 * The motivating case is `src/bundle/bundle.ts`, whose top-level
 * `export const bundle = new Bundle()` constructs a container — and triggers
 * environment parsing and logger wiring — merely on import. By routing the import
 * through {@link https://jestjs.io/docs/jest-object#jestisolatemodulesfn | jest.isolateModules},
 * each invocation gets a private module registry: the side effect runs against the
 * environment in force for this call (typically set via `withEnv`) and is discarded
 * afterwards.
 *
 * `jest.isolateModules` executes its callback synchronously, so the loaded value is
 * captured and returned synchronously as well.
 *
 * @typeParam T - Type produced by the loader (e.g. the module's exports).
 * @param loader - Synchronous factory that performs the `require`/import and returns
 *   the value under test. Must run synchronously.
 * @returns The value produced by `loader`.
 * @throws Error If the loader does not execute synchronously within the isolated scope.
 *
 * @example
 * ```ts
 * const { bundle } = isolatedImport(() => require('@core/bundle/bundle'));
 * ```
 */
export function isolatedImport<T>(loader: () => T): T {
  let result: T;
  let captured = false;

  jest.isolateModules(() => {
    result = loader();
    captured = true;
  });

  if (!captured) {
    throw new Error(
      'isolatedImport: loader did not execute synchronously within jest.isolateModules.',
    );
  }

  // Safe: `captured` guarantees `result` was assigned within the synchronous callback.
  return result!;
}
