// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { composeFactoryBind } from '@utils/di';
import { CustomException, CustomErrorType } from '@utils/exceptions';

import { PureContainer } from './pure.container';
import {
  arbBindingKey,
  arbConstBindingKey,
  arbCtorArgs,
  FakeLeaf,
  FakeNode,
  ThrowingCtor,
} from '../../test/test-harness';

/**
 * Task 2.4 — Property-based characterization of `PureContainer` construction semantics,
 * exercised against the REAL Inversify framework (intrinsic dependency of
 * `PureContainer`, never mocked — Requirement 1.2). These properties generalize the
 * example-based unit tests in `pure.container.test.ts` (Task 2.3) across many inputs.
 *
 * Every `fc.assert` uses the project-standard `numRuns: 100` with shrinking enabled so
 * any counterexample is minimized for diagnosis.
 *
 * Covered properties (see design.md "Correctness Properties"):
 *   - Property 2: Constructor argument ordering (mapped args first, resolved deps next).
 *   - Property 3: Condition mapper transforms the value handed to the constructor.
 *   - Property 8: Fresh instance per `run` (current per-run construction semantics).
 *   - Property 4: Constant binding round-trip (Task 2.6).
 *   - Property 5: Error surfaces on invalid args/deps/ctor (Task 2.6).
 */

/**
 * Local probe that captures the full positional argument vector its constructor
 * receives, enabling precise multi-slot ordering assertions beyond the two-slot shape
 * of the shared {@link FakeNode} fixture.
 */
class ArgOrderProbe {
  public readonly received: unknown[];

  constructor(...args: unknown[]) {
    this.received = args;
  }
}

/** A binding-option entry as accepted by `PureContainer.tie` (test-local shape). */
type TieEntry = {
  target: unknown;
  args: { value: unknown; condition?: (value: unknown) => unknown }[];
  deps: string[];
};

/**
 * Value-transforming `condition` mappers. Each returns a value whose SHAPE differs from
 * any scalar input, so the "mapped value, not the original" invariant of Property 3 is
 * observable for every generated scalar (a wrapped value never deep-equals the scalar
 * it wraps).
 */
const arbTransform: fc.Arbitrary<(value: unknown) => unknown> = fc.constantFrom<
  ((value: unknown) => unknown)[]
>(
  (value: unknown) => [value],
  (value: unknown) => ({ wrapped: value }),
  (value: unknown) => `mapped:${String(value)}`,
);

/**
 * A single JSON-representable scalar argument value, excluding `NaN` so equality
 * assertions stay deterministic. Mirrors the scalar space used by the shared
 * arbitraries without exporting an internal helper.
 */
const arbScalarValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
);

/**
 * **Feature: library-test-coverage, Property 2: Constructor argument ordering (args before deps)**
 *
 * For any binding with static `args` and `dependencies`, `run` constructs the instance
 * with the mapped static args first (in declaration order), then the resolved
 * dependencies (in declaration order): `new Instance(...mappedArgs, ...resolvedDeps)`.
 *
 * **Validates: Requirements 4.2**
 */
describe('Property 2 — constructor argument ordering (args before deps)', () => {
  test('applies mapped static args first, then resolved dependencies, in declaration order', () => {
    fc.assert(
      fc.property(
        arbCtorArgs,
        fc.array(fc.string(), { maxLength: 4 }),
        (argValues: unknown[], depTags: string[]) => {
          const container = new PureContainer();

          // Dependencies are declared (and therefore inserted) BEFORE the probe so the
          // container can resolve them; insertion order is the declaration order the
          // production code preserves.
          const options: Record<string, TieEntry> = {};
          depTags.forEach((tag: string, index: number) => {
            options[`dep_${index}`] = {
              target: FakeLeaf,
              args: [{ value: tag }],
              deps: [],
            };
          });
          options.probe = {
            target: ArgOrderProbe,
            args: argValues.map((value: unknown) => ({ value })),
            deps: depTags.map((_: string, index: number) => `dep_${index}`),
          };

          container.tie(options as never);

          const probe = container.run<ArgOrderProbe>('probe');

          // The vector length is exactly args + deps with no extra/missing slots.
          expect(probe.received).toHaveLength(argValues.length + depTags.length);

          // Leading slots: static args, by reference (identity mapper), in order.
          argValues.forEach((value: unknown, index: number) => {
            expect(Object.is(probe.received[index], value)).toBe(true);
          });

          // Trailing slots: resolved FakeLeaf dependencies, in order, each carrying its
          // declared tag — proving deps follow args and keep their declaration order.
          depTags.forEach((tag: string, index: number) => {
            const slot = probe.received[argValues.length + index];
            expect(slot).toBeInstanceOf(FakeLeaf);
            expect((slot as FakeLeaf).tag).toBe(tag);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: library-test-coverage, Property 3: Condition mapper transforms the constructor value**
 *
 * For any arg with a `condition` mapper, the value passed to the constructor equals
 * `condition(value)`, not the original `value`.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 3 — condition mapper transforms the constructor value', () => {
  test('passes condition(value) to the constructor, never the original value', () => {
    fc.assert(
      fc.property(
        arbScalarValue,
        arbTransform,
        (value: unknown, transform: (value: unknown) => unknown) => {
          const container = new PureContainer();

          container.tie({
            leaf: {
              target: FakeLeaf,
              args: [{ value, condition: transform }],
              deps: [],
            },
          } as never);

          const leaf = container.run<FakeLeaf>('leaf');

          // The constructor received exactly the mapped value...
          expect(leaf.tag).toStrictEqual(transform(value));
          // ...and never the raw, unmapped scalar (each transform changes the shape).
          expect(leaf.tag).not.toStrictEqual(value);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: library-test-coverage, Property 8: Fresh instance per run (current identity semantics)**
 *
 * For any factory binding, repeated `run` calls produce DISTINCT instances, pinning the
 * current per-run construction semantics (each `run` invokes the factory, which calls
 * `new instance(...)` afresh).
 *
 * **Validates: Requirements 4.6**
 */
describe('Property 8 — fresh instance per run (current identity semantics)', () => {
  test('repeated run calls yield distinct instances with identical configuration', () => {
    fc.assert(
      fc.property(arbBindingKey, arbScalarValue, (key: string, tag: unknown) => {
        const container = new PureContainer();

        container.tie({
          [key]: {
            target: FakeLeaf,
            args: [{ value: tag }],
            deps: [],
          },
        } as never);

        const first = container.run<FakeLeaf>(key);
        const second = container.run<FakeLeaf>(key);

        // Distinct identities per run (no caching/singleton reuse)...
        expect(first).not.toBe(second);
        expect(first).toBeInstanceOf(FakeLeaf);
        expect(second).toBeInstanceOf(FakeLeaf);
        // ...yet identical configuration, confirming construction (not identity) varies.
        expect(first.tag).toStrictEqual(second.tag);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Captures the value thrown by `run`, failing the property if nothing is thrown. Keeps
 * the error-surface assertions linear (no inline try/catch) while still exposing the
 * concrete {@link CustomException} instance for `code`/`message` inspection. Mirrors the
 * example-based helper in `pure.container.test.ts` (Task 2.5) so both suites pin the same
 * observable surface across single examples and generated inputs.
 */
const captureRunFailure = (run: () => unknown): CustomException => {
  try {
    run();
  } catch (error) {
    return error as CustomException;
  }
  throw new Error('Expected `run` to throw, but it returned normally.');
};

/**
 * **Feature: library-test-coverage, Property 4: Constant binding round-trip**
 *
 * For any constant binding, `runConstant` returns the bound value (the `condition`-mapped
 * value, identity by default), AND constants are not resolvable as factory dependencies —
 * the current limitation, because `tieConst` binds under the RAW name token while `tie`
 * resolves dependencies through the `composeFactoryBind` envelope a constant never
 * registers.
 *
 * **Validates: Requirements 4.4**
 */
describe('Property 4 — constant binding round-trip', () => {
  test('runConstant returns the bound value (condition-mapped, identity by default)', () => {
    fc.assert(
      fc.property(
        arbConstBindingKey,
        arbScalarValue,
        fc.option(arbTransform, { nil: undefined }),
        (
          key: string,
          value: unknown,
          transform: ((value: unknown) => unknown) | undefined,
        ) => {
          const container = new PureContainer();

          // With a mapper the bound value is `condition(value)`; without one it is the
          // original value, round-tripped by reference (no cloning/transformation).
          const args = transform
            ? [{ value, condition: transform }]
            : [{ value }];

          container.tieConst({
            [key]: { target: FakeLeaf, args, deps: [] },
          } as never);

          const expected = transform ? transform(value) : value;
          expect(container.runConstant(key)).toStrictEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('LIMITATION: a constant is not resolvable as a factory dependency', () => {
    fc.assert(
      fc.property(arbConstBindingKey, arbScalarValue, (key: string, value: unknown) => {
        const container = new PureContainer();

        container.tieConst({
          [key]: { target: FakeLeaf, args: [{ value }], deps: [] },
        } as never);

        // The `Factory<key>` token a factory binding would use is never registered for a
        // constant, so the envelope token cannot be resolved directly...
        expect(() => container.get(composeFactoryBind(key))).toThrow();

        // ...and wiring the constant as a `tie` graph dependency fails through the
        // "invalid dependencies" surface (resolution goes via `composeFactoryBind(dep)`).
        container.tie({
          node: { target: FakeNode, args: [], deps: [key] },
        } as never);

        const failure = captureRunFailure(() => container.run('node'));

        expect(failure).toBeInstanceOf(CustomException);
        expect(failure.code).toBe(CustomErrorType.InternalError);
        expect(failure.message).toContain('invalid dependencies');
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: library-test-coverage, Property 5: Error surfaces on invalid args/deps/ctor**
 *
 * For any binding whose arg `condition` mapper throws, whose dependency is unregistered,
 * or whose constructor throws, the lazily-invoked factory raises a
 * `CustomException.InternalError`. Each failure path carries its own discriminating
 * message fragment ("invalid arguments", "invalid dependencies", "Pure Container
 * Exception:") so a single property covers all three surfaces across generated keys.
 *
 * **Validates: Requirements 4.5**
 */
describe('Property 5 — error surfaces on invalid args/deps/ctor', () => {
  test('invalid args: a throwing condition mapper yields an InternalError', () => {
    fc.assert(
      fc.property(
        arbBindingKey,
        arbScalarValue,
        fc.string(),
        (key: string, value: unknown, message: string) => {
          const container = new PureContainer();
          const argError = new Error(message);

          container.tie({
            [key]: {
              target: FakeLeaf,
              args: [{ value, condition: () => { throw argError; } }],
              deps: [],
            },
          } as never);

          const failure = captureRunFailure(() => container.run(key));

          expect(failure).toBeInstanceOf(CustomException);
          expect(failure.code).toBe(CustomErrorType.InternalError);
          expect(failure.message).toContain('invalid arguments');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('invalid dependencies: an unregistered dependency yields an InternalError', () => {
    fc.assert(
      fc.property(arbBindingKey, (key: string) => {
        const container = new PureContainer();

        // `ghost_<key>` is never tied, so its `composeFactoryBind` token is unresolvable;
        // prefixing the generated key guarantees the dependency differs from the binding.
        container.tie({
          [key]: { target: FakeNode, args: [], deps: [`ghost_${key}`] },
        } as never);

        const failure = captureRunFailure(() => container.run(key));

        expect(failure).toBeInstanceOf(CustomException);
        expect(failure.code).toBe(CustomErrorType.InternalError);
        expect(failure.message).toContain('invalid dependencies');
      }),
      { numRuns: 100 },
    );
  });

  test('throwing constructor: a failing `new instance(...)` yields an InternalError', () => {
    fc.assert(
      fc.property(arbBindingKey, (key: string) => {
        const container = new PureContainer();

        container.tie({
          [key]: { target: ThrowingCtor, args: [], deps: [] },
        } as never);

        const failure = captureRunFailure(() => container.run(key));

        expect(failure).toBeInstanceOf(CustomException);
        expect(failure.code).toBe(CustomErrorType.InternalError);
        expect(failure.message).toContain('Pure Container Exception:');
      }),
      { numRuns: 100 },
    );
  });
});
