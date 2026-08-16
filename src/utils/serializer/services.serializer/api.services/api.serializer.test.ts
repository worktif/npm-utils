// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Defensive isolation of the `@core/bundle` barrel.
 *
 * `api.serializer.ts` declares value imports from `@utils/logger` (currently unused —
 * the `loggerInstance` field is commented out — so TypeScript elides them). Should that
 * elision ever stop (e.g. a future edit re-enables the logger field), the import graph
 * would pull `logger.utils.ts → ../../bundle`, whose `export const bundle = new Bundle()`
 * triggers the characterized barrel-cycle side effect. Stubbing the bundle barrel with the
 * minimal `cli.logger` surface keeps this unit deterministic and side-effect free either
 * way. No production source is modified; the mock resolves to the same `src/bundle` module.
 */
jest.mock('../../../../bundle', () => ({
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

import { captureConsole, isolatedImport } from '../../../../../test/test-harness';
import type { ConsoleRecords } from '../../../../../test/test-harness';
import { ApiSerializer } from './api.serializer';

/**
 * Task 4.1 — Cover the API serializer (Requirement 6.1: success/error response shape;
 * Requirement 6.4: no observable side effects when not invoked).
 *
 * Characterization note: the production `ApiSerializer` exposes a single public operation,
 * `identity<RS, T>(bodyOrResponse)`, delegating to the protected `_identity`. Both are pure
 * pass-throughs — they return the EXACT input reference, performing no shaping, cloning, or
 * status-code envelope composition. (`composeApiResponse`, the status-coded envelope helper,
 * lives in `@utils/common` and is covered by Task 4.3, not here.) These tests therefore pin
 * the current, documented response shape of the API serializer: the output equals the input.
 */

/** Representative "success response" payloads (shape-preserving identity must not alter them). */
const arbSuccessResponse: fc.Arbitrary<unknown> = fc.record({
  data: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.array(fc.string(), { maxLength: 4 }),
    fc.record({ id: fc.string(), value: fc.integer() }),
  ),
  statusCode: fc.constantFrom(200, 201, 204),
});

/** Representative "error response" payloads. */
const arbErrorResponse: fc.Arbitrary<unknown> = fc.record({
  error: fc.record({
    message: fc.string(),
    code: fc.constantFrom('BAD_REQUEST', 'UNPROCESSABLE_ENTITY', 'INTERNAL'),
  }),
  statusCode: fc.constantFrom(400, 422, 500),
});

/**
 * Full input space for Property 12: success-shaped records, error-shaped records, and a
 * spread of bare scalars/containers — the serializer's `identity` accepts any value.
 */
const arbAnyResponse: fc.Arbitrary<unknown> = fc.oneof(
  arbSuccessResponse,
  arbErrorResponse,
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything(), { maxLength: 4 }),
);

describe('ApiSerializer — identity response shape (Requirement 6.1)', () => {
  let serializer: ApiSerializer;

  beforeEach(() => {
    serializer = new ApiSerializer();
  });

  test('returns the exact same reference for a success-shaped object', () => {
    const success = { data: { id: 'u-1', value: 42 }, statusCode: 200 };

    const result = serializer.identity<typeof success, typeof success>(success);

    // Pass-through: shape preserved AND reference identity preserved (no clone).
    expect(result).toBe(success);
    expect(result).toEqual({ data: { id: 'u-1', value: 42 }, statusCode: 200 });
  });

  test('returns the exact same reference for an error-shaped object', () => {
    const failure = { error: { message: 'invalid', code: 'UNPROCESSABLE_ENTITY' }, statusCode: 422 };

    const result = serializer.identity<typeof failure, typeof failure>(failure);

    expect(result).toBe(failure);
    expect(result).toEqual({ error: { message: 'invalid', code: 'UNPROCESSABLE_ENTITY' }, statusCode: 422 });
  });

  test('passes primitive inputs through unchanged', () => {
    expect(serializer.identity<string, string>('ok')).toBe('ok');
    expect(serializer.identity<number, number>(0)).toBe(0);
    expect(serializer.identity<boolean, boolean>(false)).toBe(false);
    expect(serializer.identity<null, null>(null)).toBeNull();
    expect(serializer.identity<undefined, undefined>(undefined)).toBeUndefined();
  });

  test('binds `identity` in the constructor so it can be destructured without losing `this`', () => {
    const { identity } = serializer;
    const payload = { data: 'detached', statusCode: 200 };

    // If `identity` were unbound, `this._identity` would throw on the detached call.
    expect(identity<typeof payload, typeof payload>(payload)).toBe(payload);
  });
});

describe('ApiSerializer — property-based response shape', () => {
  /**
   * **Feature: library-test-coverage, Property 12: API serializer response shape**
   *
   * For any success or error input, the API serializer produces the documented response
   * shape. The documented (current) shape is a total, reference-preserving identity: for
   * every input the serializer returns the SAME reference (`toBe`) and a structurally equal
   * value (`toEqual`), never throwing and never reshaping success vs. error inputs
   * differently. This pins the pass-through contract before any DI/serializer optimization.
   *
   * **Validates: Requirements 6.1**
   */
  test('Property 12: identity preserves shape and reference for any success/error input', () => {
    const serializer = new ApiSerializer();

    fc.assert(
      fc.property(arbAnyResponse, (input: unknown) => {
        const result = serializer.identity<unknown, unknown>(input);

        // Reference-preserving identity (objects/arrays are not cloned).
        expect(result).toBe(input);
        // Structural equality (covers primitives, null, and undefined uniformly).
        expect(result).toEqual(input);
      }),
      { numRuns: 100 },
    );
  });
});

describe('ApiSerializer — no observable side effects when not invoked (Requirement 6.4)', () => {
  /**
   * Faithful 6.4 characterization: freshly load the serializer module AND construct an
   * instance under captured console sinks WITHOUT invoking any serialization method, and
   * assert nothing is written to `log`/`warn`/`error`. `isolatedImport` gives a private
   * module registry so the import-time evaluation is observed too (not just construction).
   */
  test('importing the module and constructing the serializer emits no console output', () => {
    const records: ConsoleRecords = captureConsole();

    try {
      const mod = isolatedImport(
        () => require('./api.serializer') as typeof import('./api.serializer'),
      );

      // Construct, but deliberately DO NOT call `identity` (serializer "not invoked").
      const instance = new mod.ApiSerializer();
      expect(instance).toBeInstanceOf(mod.ApiSerializer);
    } finally {
      records.restore();
    }

    expect(records.log).toHaveLength(0);
    expect(records.warn).toHaveLength(0);
    expect(records.error).toHaveLength(0);
  });
});
