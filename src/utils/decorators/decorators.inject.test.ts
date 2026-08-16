// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 6.1 — unit + property coverage for `injectBefore` / `injectAfter` invocation
 * ordering (Requirement 9.1, Property 19).
 *
 * Isolation (Requirement 2.2): `injectBefore` imports `LoggerLevel` from the `@utils/logger`
 * barrel, which transitively pulls `logger.utils.ts`'s `import { bundle } from '../../bundle'`.
 * Under ts-jest/CommonJS that barrel would evaluate `bundle.ts`'s
 * `export const bundle = new Bundle()` side effect and trip the characterized serializer
 * barrel-cycle defect (`Class extends value undefined`). We stub `../../bundle` with the
 * minimal `cli.logger` surface so the decorators can be unit-tested in isolation. No
 * production source is modified; the mock path resolves to the same `src/bundle` module the
 * unit imports.
 */
jest.mock('../../bundle', () => ({
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

import { injectBefore } from './decorators.inject-before';
import { injectAfter } from './decorators.inject-after';
import { TypeDefTypes } from './decorators.types';

/**
 * A minimal `BeforeInstance`-shaped object: carries the `before_instance` typeDef so the
 * `injectBefore` wrapper recognizes it, but no `log`, keeping each case a pure no-op on the
 * logging path (we assert ordering only).
 */
const makeBeforeInstance = (): { typeDef: TypeDefTypes.BeforeInstance } => ({
  typeDef: TypeDefTypes.BeforeInstance,
});

describe('injectBefore — invocation order (Requirement 9.1)', () => {
  test('runs the injected "before" function first, then the original method', async () => {
    const order: string[] = [];

    const before = async function (): Promise<{ typeDef: TypeDefTypes.BeforeInstance }> {
      order.push('before');
      return makeBeforeInstance();
    };

    class Service {
      @injectBefore(before as never)
      async run(value: number, _beforeInstance?: unknown): Promise<number> {
        order.push('original');
        return value * 2;
      }
    }

    const result = await new Service().run(5);

    // Documented order: injected "before" precedes the original method body.
    expect(order).toEqual(['before', 'original']);
    expect(result).toBe(10);
  });

  test('appends the produced beforeInstance as the trailing argument to the original method', async () => {
    const beforeInstance = makeBeforeInstance();

    const before = async function (): Promise<{ typeDef: TypeDefTypes.BeforeInstance }> {
      return beforeInstance;
    };

    let receivedArgs: unknown[] = [];

    class Service {
      @injectBefore(before as never)
      async run(...args: unknown[]): Promise<void> {
        receivedArgs = args;
      }
    }

    await new Service().run('a', 'b');

    // The original receives the caller args (minus any before_instance) with the freshly
    // produced beforeInstance appended last.
    expect(receivedArgs).toEqual(['a', 'b', beforeInstance]);
  });

  test('merges additional data when a beforeInstance is already supplied in args', async () => {
    const before = async function (): Promise<Record<string, unknown>> {
      return { typeDef: TypeDefTypes.BeforeInstance, extra: 'merged' } as never;
    };

    const existing = { typeDef: TypeDefTypes.BeforeInstance } as Record<string, unknown>;
    let trailing: Record<string, unknown> | undefined;

    class Service {
      @injectBefore(before as never)
      async run(supplied: unknown): Promise<void> {
        trailing = supplied as Record<string, unknown>;
      }
    }

    await new Service().run(existing);

    // The pre-supplied beforeInstance is mutated in place (Object.assign) and forwarded.
    expect(existing.extra).toBe('merged');
    expect(trailing).toBe(existing);
  });
});

describe('injectAfter — invocation order (Requirement 9.1)', () => {
  test('runs the original method first, then the injected "after" function with its result', async () => {
    const order: string[] = [];
    let afterReceived: unknown;

    const after = function (response: unknown): { wrapped: unknown } {
      order.push('after');
      afterReceived = response;
      return { wrapped: response };
    };

    class Service {
      @injectAfter(after)
      async run(value: number): Promise<number> {
        order.push('original');
        return value + 1;
      }
    }

    const result = await new Service().run(4);

    // Documented order: the original method body precedes the injected "after" function.
    expect(order).toEqual(['original', 'after']);
    expect(afterReceived).toBe(5);
    expect(result).toEqual({ wrapped: 5 });
  });
});

describe('Property 19 — inject ordering', () => {
  /**
   * **Feature: library-test-coverage, Property 19: Inject ordering**
   *
   * For ANY decorated method invocation:
   *  - `injectBefore` runs the injected "before" function strictly before the original
   *    method body, and
   *  - `injectAfter` runs the original method body strictly before the injected "after"
   *    function,
   * regardless of the (JSON-stable) argument the method is called with.
   *
   * **Validates: Requirements 9.1**
   */
  test('Property 19: injectBefore is before→original; injectAfter is original→after', async () => {
    const arbArg: fc.Arbitrary<unknown> = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
    );

    await fc.assert(
      fc.asyncProperty(arbArg, async (arg) => {
        // --- injectBefore: before precedes original ---------------------------------
        const beforeOrder: string[] = [];
        const before = async function (): Promise<{ typeDef: TypeDefTypes.BeforeInstance }> {
          beforeOrder.push('before');
          return makeBeforeInstance();
        };

        class BeforeService {
          @injectBefore(before as never)
          async run(_value: unknown, _bi?: unknown): Promise<string> {
            beforeOrder.push('original');
            return 'before-done';
          }
        }

        const beforeResult = await new BeforeService().run(arg);

        // --- injectAfter: original precedes after -----------------------------------
        const afterOrder: string[] = [];
        const after = function (response: unknown): unknown {
          afterOrder.push('after');
          return response;
        };

        class AfterService {
          @injectAfter(after)
          async run(value: unknown): Promise<unknown> {
            afterOrder.push('original');
            return value;
          }
        }

        const afterResult = await new AfterService().run(arg);

        return (
          beforeOrder.length === 2 &&
          beforeOrder[0] === 'before' &&
          beforeOrder[1] === 'original' &&
          beforeResult === 'before-done' &&
          afterOrder.length === 2 &&
          afterOrder[0] === 'original' &&
          afterOrder[1] === 'after' &&
          afterResult === arg
        );
      }),
      { numRuns: 100 },
    );
  });
});
