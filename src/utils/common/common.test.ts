// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';
import { StatusCodes } from 'http-status-codes';

import {
  COMMA,
  DASH,
  DOT,
  EMPTY_NUMBER,
  EMPTY_STRING,
  PromiseSettledStatus,
  SEMICOLUMN,
  SLASH,
  SPACE,
  UNDERSCORE,
  capitalizeFirstLetters,
  completePromiseSettled,
  composeApiResponse,
  intersection,
  omitInternally,
} from '@utils/common/common';

/**
 * Task 4.3 — Cover the remaining common utilities (Requirements 10.1, 10.2, 10.3).
 *
 * Scope note (no production change; characterization only):
 * - The `error()` helper is already covered by `error.helper.test.ts` (Task 4.2) and is NOT
 *   re-asserted here.
 * - The `identity*` helpers and ANSI escape constants referenced by Requirement 10's prose
 *   physically live in `serializer.utils.ts` and `logger.utils.ts` respectively and are
 *   covered by their own suites (Tasks 4.1 / 3.x). This file pins ONLY the helpers that
 *   actually reside in `src/utils/common/common.ts`.
 *
 * The common helpers under test are pure, deterministic projections with no I/O and no
 * environment branching. Property 21 pins their purity / referential transparency; Property
 * 22 pins that the formatting-adjacent helpers (`capitalizeFirstLetters`, `composeApiResponse`)
 * perform NO TTY detection — their output is identical whether `process.stdout.isTTY` is true
 * or false (the ANSI/TTY behavior the requirement alludes to belongs to the logger utilities,
 * not to `common.ts`).
 */

describe('common — string/number constants (characterization)', () => {
  test('exposes the documented primitive constants verbatim', () => {
    expect(EMPTY_STRING).toBe('');
    expect(UNDERSCORE).toBe('_');
    expect(EMPTY_NUMBER).toBe(0);
    expect(SLASH).toBe('/');
    expect(DASH).toBe('-');
    expect(DOT).toBe('.');
    expect(SEMICOLUMN).toBe(';');
    expect(SPACE).toBe(' ');
    expect(COMMA).toBe(',');
  });
});

describe('common — capitalizeFirstLetters (Requirement 10.1)', () => {
  test('capitalizes the first letter of each space-separated word', () => {
    expect(capitalizeFirstLetters('hello world')).toBe('Hello World');
    expect(capitalizeFirstLetters('the quick brown fox')).toBe('The Quick Brown Fox');
  });

  test('leaves the remainder of each word untouched (only the first char is upper-cased)', () => {
    expect(capitalizeFirstLetters('iPhone mACBOOK')).toBe('IPhone MACBOOK');
  });

  test('preserves a single-word input and is idempotent on already-capitalized input', () => {
    expect(capitalizeFirstLetters('solo')).toBe('Solo');
    expect(capitalizeFirstLetters('Solo')).toBe('Solo');
    expect(capitalizeFirstLetters(capitalizeFirstLetters('hello world'))).toBe('Hello World');
  });

  test('preserves the exact number of space separators (empty segments stay empty)', () => {
    // 'a  b' splits to ['a', '', 'b']; the empty middle segment yields no character.
    expect(capitalizeFirstLetters('a  b')).toBe('A  B');
    expect(capitalizeFirstLetters('')).toBe('');
  });
});

describe('common — intersection (Requirement 10.1)', () => {
  test('returns elements present in both arrays, de-duplicated, in first-array order', () => {
    expect(intersection([1, 2, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    expect(intersection(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
  });

  test('returns an empty array when there is no overlap', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([]);
    expect(intersection([], [1, 2])).toEqual([]);
    expect(intersection([1, 2], [])).toEqual([]);
  });

  test('does not mutate either input array', () => {
    const a = [1, 2, 3];
    const b = [2, 3, 4];
    intersection(a, b);
    expect(a).toEqual([1, 2, 3]);
    expect(b).toEqual([2, 3, 4]);
  });
});

describe('common — omitInternally (Requirement 10.1)', () => {
  const internalKeys = [
    '__typename',
    'id',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'deletedAt',
    'deletedBy',
    'password',
  ];

  test('omits the predefined internal keys from the object', () => {
    const source = {
      id: 'u-1',
      __typename: 'User',
      password: 'secret',
      name: 'Ada',
      email: 'ada@example.com',
    };

    const result = omitInternally(source, []);

    expect(result).toEqual({ name: 'Ada', email: 'ada@example.com' });
    for (const key of internalKeys) {
      expect(result).not.toHaveProperty(key);
    }
  });

  test('retains keys listed in crucialPoints even if they are internal', () => {
    const source = { id: 'keep-me', password: 'secret', name: 'Ada' };

    // `id` is declared crucial → it must survive; `password` is still omitted.
    const result = omitInternally(source, ['id']);

    expect(result).toEqual({ id: 'keep-me', name: 'Ada' });
  });

  test('does not mutate the source object', () => {
    const source = { id: 'u-1', name: 'Ada' };
    const snapshot = { ...source };

    omitInternally(source, []);

    expect(source).toEqual(snapshot);
  });

  test('returns a structurally empty object when only internal keys are present', () => {
    expect(omitInternally({ id: 'x', password: 'y' }, [])).toEqual({});
  });
});

describe('common — composeApiResponse (Requirement 10.1)', () => {
  test('produces the documented envelope with default status and content type', () => {
    const response = composeApiResponse({ name: 'Ada' });

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    expect(JSON.parse(response.body)).toEqual({ name: 'Ada' });
  });

  test('honors an explicit status code and content type', () => {
    const response = composeApiResponse(
      { ok: false },
      StatusCodes.UNPROCESSABLE_ENTITY,
      'text/plain',
    );

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    expect(response.headers['Content-Type']).toBe('text/plain');
  });

  test('strips internal keys from the serialized body, honoring crucialPoints', () => {
    const body = composeApiResponse(
      { id: 'u-1', password: 'secret', name: 'Ada' },
      StatusCodes.OK,
      'application/json',
      ['id'],
    ).body;

    expect(JSON.parse(body)).toEqual({ id: 'u-1', name: 'Ada' });
  });

  test('emits an empty-string body for a falsy response', () => {
    expect(composeApiResponse(undefined as never).body).toBe(EMPTY_STRING);
    expect(composeApiResponse('' as never).body).toBe(EMPTY_STRING);
  });
});

describe('common — completePromiseSettled (Requirement 10.3)', () => {
  test('groups fulfilled values and rejected reasons under their settlement status', async () => {
    const settled: PromiseSettledResult<number>[] = [
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: new Error('boom') },
      { status: 'fulfilled', value: 2 },
    ];

    const grouped = await completePromiseSettled(settled);

    expect(grouped[PromiseSettledStatus.Fulfilled]).toEqual([1, 2]);
    expect(grouped[PromiseSettledStatus.Rejected]).toHaveLength(1);
    expect((grouped[PromiseSettledStatus.Rejected][0] as unknown as Error).message).toBe('boom');
  });

  test('always returns both status buckets, empty when no result matches', async () => {
    const grouped = await completePromiseSettled([]);

    expect(grouped).toEqual({
      [PromiseSettledStatus.Fulfilled]: [],
      [PromiseSettledStatus.Rejected]: [],
    });
  });

  test('preserves input order within each settlement bucket', async () => {
    const settled: PromiseSettledResult<string>[] = [
      { status: 'fulfilled', value: 'a' },
      { status: 'fulfilled', value: 'b' },
      { status: 'rejected', reason: 'r1' },
      { status: 'rejected', reason: 'r2' },
    ];

    const grouped = await completePromiseSettled(settled);

    expect(grouped[PromiseSettledStatus.Fulfilled]).toEqual(['a', 'b']);
    expect(grouped[PromiseSettledStatus.Rejected]).toEqual(['r1', 'r2']);
  });

  test('integrates with a real Promise.allSettled outcome', async () => {
    const settled = await Promise.allSettled([
      Promise.resolve('ok'),
      Promise.reject(new Error('nope')),
    ]);

    const grouped = await completePromiseSettled(settled);

    expect(grouped[PromiseSettledStatus.Fulfilled]).toEqual(['ok']);
    expect((grouped[PromiseSettledStatus.Rejected][0] as unknown as Error).message).toBe('nope');
  });

  test('PromiseSettledStatus enum mirrors the native settlement vocabulary', () => {
    expect(PromiseSettledStatus.Fulfilled).toBe('fulfilled');
    expect(PromiseSettledStatus.Rejected).toBe('rejected');
  });
});

describe('common — property-based purity (Requirement 10.1)', () => {
  /** A JSON-serializable scalar usable as object values for purity checks. */
  const arbScalar: fc.Arbitrary<unknown> = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
  );

  /**
   * A flat record of arbitrary keys → scalar values (the shape helpers operate on).
   *
   * The reserved `__proto__` key is excluded from the key space: as a literal own
   * key it cannot be faithfully reproduced by the spread-based mutation baseline
   * (`{ ...record }` interprets `__proto__` as a prototype assignment rather than an
   * own enumerable property), which would yield a false non-mutation mismatch even
   * though the helpers under test are pure. The helpers operate on plain data records,
   * so `__proto__` as a data key is outside their intended domain.
   */
  const arbRecord: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    fc.string().filter((key: string) => key !== '__proto__'),
    arbScalar,
    { maxKeys: 8 },
  );

  /**
   * **Feature: library-test-coverage, Property 21: Identity/helper purity**
   *
   * For any input, the common helper functions are pure and referentially transparent:
   * repeated invocations on the same input yield deeply-equal results, and the call leaves
   * its arguments unmutated. This pins the helpers as side-effect-free projections — a
   * precondition for safely refactoring callers around them.
   *
   * **Validates: Requirements 10.1**
   */
  test('Property 21: capitalizeFirstLetters / intersection / omitInternally are deterministic and non-mutating', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.integer(), { maxLength: 12 }),
        fc.array(fc.integer(), { maxLength: 12 }),
        arbRecord,
        fc.array(fc.string(), { maxLength: 5 }),
        (sentence, arrA, arrB, record, crucialPoints) => {
          // --- capitalizeFirstLetters: deterministic projection ---------------
          expect(capitalizeFirstLetters(sentence)).toBe(capitalizeFirstLetters(sentence));

          // --- intersection: deterministic + does not mutate either input -----
          const arrASnapshot = [...arrA];
          const arrBSnapshot = [...arrB];
          const firstIntersection = intersection(arrA, arrB);
          const secondIntersection = intersection(arrA, arrB);
          expect(firstIntersection).toEqual(secondIntersection);
          // Every element of the result is present in both inputs and unique.
          expect(new Set(firstIntersection).size).toBe(firstIntersection.length);
          for (const item of firstIntersection) {
            expect(arrA).toContain(item);
            expect(arrB).toContain(item);
          }
          expect(arrA).toEqual(arrASnapshot);
          expect(arrB).toEqual(arrBSnapshot);

          // --- omitInternally: deterministic + does not mutate the source -----
          const recordSnapshot = { ...record };
          const firstOmit = omitInternally(record, crucialPoints);
          const secondOmit = omitInternally(record, crucialPoints);
          expect(firstOmit).toEqual(secondOmit);
          expect(record).toEqual(recordSnapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('common — property-based TTY independence (Requirement 10.2)', () => {
  /**
   * Restores `process.stdout.isTTY` to its captured value after each TTY-sensitive run,
   * guaranteeing isolation regardless of assertion outcome.
   */
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
  });

  /**
   * Evaluates `fn` once with `process.stdout.isTTY === true` and once with `false`,
   * returning both results so a property can assert they are identical.
   */
  function underBothTtyModes<T>(fn: () => T): { tty: T; nonTty: T } {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    const tty = fn();
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    const nonTty = fn();
    return { tty, nonTty };
  }

  /**
   * **Feature: library-test-coverage, Property 22: TTY/non-TTY helper behavior**
   *
   * For any input, the formatting-adjacent helpers in `common.ts` behave identically under
   * TTY and non-TTY detection. This pins the current observable behavior: `common.ts`
   * performs NO `process.stdout.isTTY` branching, so `capitalizeFirstLetters` and
   * `composeApiResponse` emit byte-for-byte identical output in both environments. (ANSI
   * colorization that DOES depend on environment lives in the logger utilities, covered by
   * their own suites — not here.)
   *
   * **Validates: Requirements 10.2**
   */
  test('Property 22: capitalizeFirstLetters and composeApiResponse are invariant to TTY detection', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.string(), { maxKeys: 6 }),
        (sentence, payload) => {
          const capitalized = underBothTtyModes(() => capitalizeFirstLetters(sentence));
          expect(capitalized.nonTty).toBe(capitalized.tty);

          const composed = underBothTtyModes(() =>
            composeApiResponse({ ...payload }, StatusCodes.OK),
          );
          expect(composed.nonTty).toEqual(composed.tty);
        },
      ),
      { numRuns: 100 },
    );
  });
});
