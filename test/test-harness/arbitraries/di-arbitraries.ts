// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

/**
 * Suffix appended to every general (factory) DI binding key — mirrors the `_bind`
 * convention of the production {@link Di} enum (e.g. `env_config_default_bind`).
 */
const BIND_SUFFIX = '_bind';

/**
 * Suffix that routes a key through `Bundle.runContainer` → `runConstant` rather than
 * the factory `run` path (see `instanceKey.endsWith('_const_bind')`).
 */
const CONST_BIND_SUFFIX = '_const_bind';

/** Prefix that, together with {@link LAMBDA_FACTORY_SUFFIX}, marks a lambda instance. */
const LAMBDA_PREFIX = 'lambda_';

/**
 * Suffix required by `Bundle.isLambdaInstance`; a key is a lambda instance iff it
 * starts with {@link LAMBDA_PREFIX} and ends with this suffix.
 */
const LAMBDA_FACTORY_SUFFIX = '_factory_bind';

/**
 * Canonical stage tokens drawn from the real configuration surface: the
 * `WebsiteStage` enum (`prod`, `staging`), the logger default (`local`), and the
 * local-development aliases recognized by `suggestFormatterByEnvironment`
 * (`dev`, `local`, `development`). These cover the stage input space that
 * stage-aware defaults branch on.
 */
const KNOWN_STAGES: readonly string[] = [
  'dev',
  'local',
  'development',
  'prod',
  'production',
  'staging',
] as const;

/**
 * A single lowercase-alphabetic word segment (1–8 chars). Built from a fixed alphabet
 * rather than a filtered free `string` arbitrary so generated tokens are always valid
 * snake_case identifier fragments and shrink predictably.
 */
const arbWord: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars: string[]) => chars.join(''));

/**
 * A snake_case base name of 1–3 {@link arbWord} segments (e.g. `logger`,
 * `env_config_default`). Affix-free; the binding-key arbitraries below decorate it
 * with the convention-specific prefix/suffix.
 */
const arbBaseName: fc.Arbitrary<string> = fc
  .array(arbWord, { minLength: 1, maxLength: 3 })
  .map((words: string[]) => words.join('_'));

/**
 * Valid Di-style factory binding tokens: a snake_case base name suffixed with `_bind`.
 *
 * Constrained to be disjoint from the constant and lambda key spaces so it can stand
 * in for a "plain" factory binding in property tests:
 * - never ends with `_const_bind` (which would route to `runConstant`);
 * - never matches the lambda shape (`lambda_*_factory_bind`).
 *
 * @example `logger_bind`, `env_config_default_bind`
 */
export const arbBindingKey: fc.Arbitrary<string> = arbBaseName
  .map((name: string) => `${name}${BIND_SUFFIX}`)
  .filter(
    (key: string) =>
      !key.endsWith(CONST_BIND_SUFFIX) &&
      !(key.startsWith(LAMBDA_PREFIX) && key.endsWith(LAMBDA_FACTORY_SUFFIX)),
  );

/**
 * Constant binding tokens ending in `_const_bind` — the keys `Bundle.runContainer`
 * routes through `runConstant` instead of the factory `run` path.
 *
 * @example `feature_flag_const_bind`, `region_const_bind`
 */
export const arbConstBindingKey: fc.Arbitrary<string> = arbBaseName.map(
  (name: string) => `${name}${CONST_BIND_SUFFIX}`,
);

/**
 * Lambda instance tokens of the form `lambda_<name>_factory_bind`, satisfying
 * `Bundle.isLambdaInstance` (must start with `lambda_` and end with `_factory_bind`).
 *
 * @example `lambda_create_user_factory_bind`
 */
export const arbLambdaKey: fc.Arbitrary<string> = arbBaseName.map(
  (name: string) => `${LAMBDA_PREFIX}${name}${LAMBDA_FACTORY_SUFFIX}`,
);

/**
 * A single JSON-representable scalar used as a constructor argument value.
 * Excludes `NaN` so equality assertions over generated values stay deterministic.
 */
const arbScalar: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
);

/**
 * A list of constructor argument values (length 0–5) mixing scalars, flat arrays, and
 * shallow records. Models the positional `value`s a binding's static `args` ultimately
 * forward to a constructor, exercising both empty and multi-argument construction.
 */
export const arbCtorArgs: fc.Arbitrary<unknown[]> = fc.array(
  fc.oneof(
    arbScalar,
    fc.array(arbScalar, { maxLength: 4 }),
    fc.dictionary(fc.string(), arbScalar, { maxKeys: 4 }),
  ),
  { maxLength: 5 },
);

/**
 * Deployment stage tokens. Biased toward the {@link KNOWN_STAGES} the configuration
 * layer branches on, with an occasional arbitrary lowercase token to cover the
 * "unknown stage" path (which falls back to safe production defaults).
 *
 * @example `prod`, `local`, `staging`, or an unrecognized token like `qa`
 */
export const arbStage: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...KNOWN_STAGES) },
  { weight: 1, arbitrary: arbBaseName },
);
