// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Defensive isolation of the `@core/bundle` barrel — see the rationale in
 * `api.serializer.test.ts`. `serializer.utils.ts` only imports TYPES (`GqlToNull`,
 * `GqlToVoid`) from the `@utils/serializer` barrel (erased at runtime), so it pulls no
 * bundle side effect today; the stub guarantees determinism if that ever changes.
 */
jest.mock('../../../bundle', () => ({
  bundle: {
    cli: {
      logger: {
        error: jest.fn(),
        stack: jest.fn(),
      },
    },
  },
}));

import * as fc from 'fast-check';

import {
  dateNow,
  identity,
  identityToNull,
  identityToVoid,
  fromVoidToNull,
  fromNullToVoid,
  _identity,
  SerializerUtils,
} from './serializer.utils';

/**
 * Task 4.1 — Cover the serializer utilities (Requirement 6.3: pure-function behavior and
 * documented invariants).
 *
 * Characterization scope: the standalone helpers (`identity`, `_identity`, `fromVoidToNull`,
 * `fromNullToVoid`, `identityToNull`, `identityToVoid`, `dateNow`) and the bound-method
 * `SerializerUtils` class. Behavior is pinned exactly as implemented today — including the
 * asymmetry between `fromVoidToNull` (fully recursive) and `fromNullToVoid` (top-level only,
 * delegating nested values to `fromVoidToNull`).
 */

describe('serializer.utils — identity helpers (Requirement 6.3)', () => {
  test('`identity` / `_identity` return the exact same reference (referential transparency)', () => {
    const obj = { a: 1, nested: { b: 2 } };
    const arr = [1, 2, 3];

    expect(identity<typeof obj, typeof obj>(obj)).toBe(obj);
    expect(identity<typeof arr, typeof arr>(arr)).toBe(arr);
    expect(_identity<string>('x')).toBe('x');
    expect(identity<null, null>(null)).toBeNull();
    expect(identity<undefined, undefined>(undefined)).toBeUndefined();
  });
});

describe('serializer.utils — dateNow (Requirement 6.3)', () => {
  test('returns a valid ISO-8601 timestamp string', () => {
    const iso = dateNow();

    expect(typeof iso).toBe('string');
    // Exact ISO format emitted by Date.prototype.toISOString().
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe('serializer.utils — fromVoidToNull (Requirement 6.3)', () => {
  test('recursively converts undefined to null in objects', () => {
    expect(fromVoidToNull({ a: undefined, b: 1 })).toEqual({ a: null, b: 1 });
    expect(fromVoidToNull({ a: { b: undefined, c: 2 } })).toEqual({ a: { b: null, c: 2 } });
  });

  test('LOCKS current behavior: undefined ARRAY ELEMENTS are NOT converted (array branch has no null-check)', () => {
    // INTENDED FUTURE BEHAVIOR (do not "fix" here): a fully symmetric normalizer would map
    // undefined array elements to null, yielding [null, 1, { x: null }]. The current array
    // branch recurses element-wise, and `fromVoidToNull(undefined)` (a scalar) returns
    // undefined — so only the nested OBJECT value is converted.
    expect(fromVoidToNull([undefined, 1, { x: undefined }])).toEqual([undefined, 1, { x: null }]);
  });

  test('leaves existing null and concrete values unchanged', () => {
    expect(fromVoidToNull({ a: null, b: 'keep' })).toEqual({ a: null, b: 'keep' });
  });

  test('returns scalar inputs unchanged — including a bare top-level undefined (characterized)', () => {
    expect(fromVoidToNull('s')).toBe('s');
    expect(fromVoidToNull(7)).toBe(7);
    // Top-level scalar undefined is NOT a container, so it is returned as-is.
    expect(fromVoidToNull(undefined)).toBeUndefined();
  });
});

describe('serializer.utils — fromNullToVoid (Requirement 6.3)', () => {
  test('converts a top-level null property to undefined', () => {
    expect(fromNullToVoid({ a: null, b: 1 })).toEqual({ a: undefined, b: 1 });
  });

  test('LOCKS current behavior: nested null is NOT converted (recursion delegates to fromVoidToNull)', () => {
    // INTENDED FUTURE BEHAVIOR (do not "fix" here): a symmetric inverse would recurse via
    // fromNullToVoid, yielding { a: { b: undefined } }. The current implementation calls
    // fromVoidToNull on non-null nested values, so the nested null is preserved as null.
    expect(fromNullToVoid({ a: { b: null } })).toEqual({ a: { b: null } });
  });

  test('LOCKS current behavior: null ARRAY ELEMENTS are NOT converted (element recursion bottoms out at a falsy scalar)', () => {
    // INTENDED FUTURE BEHAVIOR (do not "fix" here): a symmetric inverse would map null array
    // elements to undefined, yielding [undefined, 1]. The current array branch recurses
    // `fromNullToVoid(item)`; for a bare `null` element the guard `obj && typeof obj` is
    // falsy, so the scalar branch returns null unchanged.
    expect(fromNullToVoid([null, 1])).toEqual([null, 1]);
  });

  test('returns scalar inputs unchanged', () => {
    expect(fromNullToVoid('s')).toBe('s');
    expect(fromNullToVoid(7)).toBe(7);
  });
});

describe('serializer.utils — identityToNull / identityToVoid composition (Requirement 6.3)', () => {
  test('identityToNull is fromVoidToNull composed with identity', () => {
    const input = { a: undefined, b: { c: undefined, d: 1 } };
    expect(identityToNull(input)).toEqual(fromVoidToNull(input));
    expect(identityToNull(input)).toEqual({ a: null, b: { c: null, d: 1 } });
  });

  test('identityToVoid is fromNullToVoid composed with identity', () => {
    const input = { a: null, b: 2 };
    expect(identityToVoid(input)).toEqual(fromNullToVoid(input));
    expect(identityToVoid(input)).toEqual({ a: undefined, b: 2 });
  });
});

describe('SerializerUtils class — bound methods mirror the standalone helpers (Requirement 6.3)', () => {
  test('methods stay bound when destructured off the instance', () => {
    const utils = new SerializerUtils();
    const { identity: id, fromVoidToNull: v2n, fromNullToVoid: n2v, dateNow: now } = utils;

    const obj = { a: undefined, b: 1 };
    expect(id<typeof obj, typeof obj>(obj)).toBe(obj);
    expect(v2n({ a: undefined, b: 1 })).toEqual({ a: null, b: 1 });
    expect(n2v({ a: null, b: 1 })).toEqual({ a: undefined, b: 1 });
    expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('identityToNull / identityToVoid mirror the standalone composition', () => {
    const utils = new SerializerUtils();
    const toNull = { a: undefined, b: { c: undefined } };
    const toVoid = { a: null, b: 3 };

    expect(utils.identityToNull(toNull)).toEqual({ a: null, b: { c: null } });
    expect(utils.identityToVoid(toVoid)).toEqual({ a: undefined, b: 3 });
  });
});

/**
 * Recursive JSON-ish value space INCLUDING `undefined` leaves, so the void↔null
 * normalizers are exercised across nested objects, arrays, and bare scalars. `NaN` is
 * excluded so structural equality assertions over generated values stay deterministic.
 */
const arbJsonish: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: 'small' },
    fc.constant(undefined),
    fc.constant(null),
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.double({ noNaN: true }),
    fc.array(tie('node'), { maxLength: 4 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), tie('node'), { maxKeys: 4 }),
  ),
})).node;

describe('serializer.utils — property-based invariants', () => {
  /**
   * **Feature: library-test-coverage, Property 13: Serializer utility invariants**
   *
   * For any input, the serializer utility pure functions satisfy their documented invariants
   * (idempotence / shape preservation where applicable):
   *
   *  - Referential transparency: `identity(x)` returns the exact input reference (`toBe`).
   *  - Idempotence of `fromVoidToNull`: normalizing twice deep-equals normalizing once.
   *  - Shape preservation: `fromVoidToNull` preserves container structure — object key sets
   *    and array lengths are unchanged.
   *  - Object-value completeness (the conversion that the implementation actually performs):
   *    for OBJECT inputs, no top-level own-property value remains `undefined` after
   *    normalization (object-branch undefined values become null). Note this is deliberately
   *    scoped to object values; `undefined` ARRAY elements are characterized as preserved in
   *    the example-based tests above, so the property does not over-claim a global
   *    undefined-free result.
   *
   * These invariants are referentially transparent and hold across the full nested JSON-ish
   * input space, pinning the helpers' behavior before any optimization.
   *
   * **Validates: Requirements 6.3**
   */
  test('Property 13: identity is referentially transparent; fromVoidToNull is idempotent, shape-preserving, and converts object-value undefined', () => {
    fc.assert(
      fc.property(arbJsonish, (input: unknown) => {
        // Invariant 1 — identity returns the exact same reference.
        expect(identity<unknown, unknown>(input)).toBe(input);

        // Invariant 2 — idempotence: f(f(x)) deep-equals f(x).
        const once = fromVoidToNull(input);
        const twice = fromVoidToNull(once);
        expect(twice).toEqual(once);

        // Invariants 3 & 4 — structure preservation + object-value completeness.
        if (input !== null && typeof input === 'object') {
          if (Array.isArray(input)) {
            expect(Array.isArray(once)).toBe(true);
            expect((once as unknown[]).length).toBe(input.length);
          } else {
            const keys = Object.keys(input as Record<string, unknown>).sort();
            expect(Object.keys(once as Record<string, unknown>).sort()).toEqual(keys);
            // Object-branch undefined values are converted to null (none remain undefined).
            const hasUndefinedValue = Object.values(
              once as Record<string, unknown>,
            ).some((v) => v === undefined);
            expect(hasUndefinedValue).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
