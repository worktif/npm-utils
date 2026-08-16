// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Declarative set of environment-variable overrides applied for the duration of a
 * single {@link withEnv} invocation.
 *
 * - A `string` value sets (or replaces) the variable.
 * - An `undefined` value explicitly unsets the variable, allowing tests to assert
 *   behavior when a variable is absent rather than empty.
 */
export type EnvOverrides = Readonly<Record<string, string | undefined>>;

/**
 * Snapshots `process.env`, applies the supplied overrides, runs `fn`, and restores
 * the original environment exactly — including keys added, mutated, or removed by
 * either the overrides or the callback itself.
 *
 * Restoration is guaranteed via a `finally` block, so the environment is returned to
 * its captured state even when `fn` throws or rejects. This satisfies the determinism
 * and isolation contract: a test depending on environment variables sets them before
 * exercising the unit and never leaks state into sibling tests.
 *
 * @typeParam T - Result type produced by the callback.
 * @param overrides - Variables to set (`string`) or unset (`undefined`) for the run.
 * @param fn - Work to execute under the overridden environment. May be sync or async.
 * @returns A promise resolving to the callback's result.
 *
 * @example
 * ```ts
 * const config = await withEnv({ WEBSITE_STAGE: 'prod', LOG_LEVEL: undefined }, () =>
 *   isolatedImport(() => require('@core/config/env.config.default')),
 * );
 * ```
 */
export async function withEnv<T>(
  overrides: EnvOverrides,
  fn: () => T | Promise<T>,
): Promise<T> {
  const snapshot: NodeJS.ProcessEnv = { ...process.env };

  applyOverrides(overrides);

  try {
    return await fn();
  } finally {
    restoreEnv(snapshot);
  }
}

/**
 * Applies the override map onto `process.env`, treating `undefined` as a deletion.
 */
function applyOverrides(overrides: EnvOverrides): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Restores `process.env` to the captured snapshot: removes keys that did not exist at
 * capture time and reinstates the original value for every snapshot key.
 */
function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const key of Object.keys(snapshot)) {
    process.env[key] = snapshot[key];
  }
}
