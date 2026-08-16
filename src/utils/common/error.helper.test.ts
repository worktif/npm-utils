// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { error } from '@utils/common/common';

/**
 * Task 4.2 — Cover the error helper (Requirement 7.3: the helper produces deterministic
 * output for `Error`, string, and unknown inputs).
 *
 * Characterization notes (pinned from `common.ts`, no production change):
 *
 *   export function error(e: any): string { return (e as Error).message; }
 *
 * The helper is a thin, pure projection onto the `.message` property of its argument:
 * - For an `Error` instance it returns the error's `message` string.
 * - For inputs that lack a `.message` property (plain strings, numbers, booleans, objects
 *   without `message`) the property access yields `undefined`.
 * - For any object that DOES expose a `message` property, that value is returned as-is
 *   (the declared `: string` return type is not enforced at runtime).
 * - For `null`/`undefined` the property access on a nullish receiver throws a `TypeError`.
 *   This is pinned explicitly: the failure is deterministic, not incidental.
 *
 * "Deterministic" here means referential transparency: for a given input the helper always
 * returns the same value (or always throws the same way), with no hidden state or I/O.
 */

describe('error helper — example-based characterization (Requirement 7.3)', () => {
  test('returns the message of an Error instance', () => {
    expect(error(new Error('boom'))).toBe('boom');
    expect(error(new TypeError('type-failure'))).toBe('type-failure');
    expect(error(new RangeError(''))).toBe('');
  });

  test('returns undefined for a plain string input (strings have no `message` property)', () => {
    expect(error('a plain string')).toBeUndefined();
  });

  test('returns undefined for unknown inputs without a `message` property', () => {
    expect(error(42)).toBeUndefined();
    expect(error(true)).toBeUndefined();
    expect(error({})).toBeUndefined();
    expect(error([])).toBeUndefined();
    expect(error(Symbol('s') as unknown)).toBeUndefined();
  });

  test('returns the `message` property of any object that exposes one', () => {
    expect(error({ message: 'object message' })).toBe('object message');
    expect(error({ message: 123 } as unknown)).toBe(123 as unknown as string);
  });

  test('throws a TypeError deterministically for nullish inputs', () => {
    expect(() => error(null)).toThrow(TypeError);
    expect(() => error(undefined)).toThrow(TypeError);
  });
});

describe('error helper — property-based determinism', () => {
  /**
   * Inputs spanning the documented domain: `Error` subclasses, bare strings, and a spread
   * of "unknown" values (numbers, booleans, objects with/without a `message`, arrays).
   * Nullish receivers are exercised separately above because they throw rather than return.
   */
  const arbErrorLike: fc.Arbitrary<unknown> = fc.oneof(
    fc.string().map((m) => new Error(m)),
    fc.string().map((m) => new TypeError(m)),
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.record({ message: fc.string() }),
    fc.record({ other: fc.string() }),
    fc.array(fc.string(), { maxLength: 4 }),
  );

  /**
   * **Feature: library-test-coverage, Property 15: Error formatting determinism**
   *
   * For any `Error`, string, or unknown input, the error helper produces deterministic
   * output: repeated invocations on the same input yield strictly equal results, and the
   * result always equals the input's own `.message` projection — confirming the helper is a
   * pure, side-effect-free function of its argument.
   *
   * **Validates: Requirements 7.3**
   */
  test('Property 15: error() is a deterministic, referentially transparent projection onto `.message`', () => {
    fc.assert(
      fc.property(arbErrorLike, (input: unknown) => {
        const first = error(input);
        const second = error(input);

        // Determinism: identical results across repeated calls (Object.is handles undefined).
        expect(Object.is(first, second)).toBe(true);
        // Faithful projection: the output is exactly the argument's `.message`.
        expect(first).toBe((input as { message?: unknown }).message as string | undefined);
      }),
      { numRuns: 100 },
    );
  });
});
