// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { isolatedImport, arbBindingKey, arbConstBindingKey, arbLambdaKey } from '../../test/test-harness';

import type { FakeLeaf as FakeLeafType, FakeNode as FakeNodeType } from '../../test/test-harness';
import type {
  TestBundle as TestBundleClass,
  FakeGraphConfig,
} from '../../test/test-harness/bundle/test-bundle';

/**
 * TEST-ONLY WORKAROUND for a latent circular-import / barrel-load defect
 * (characterized separately and deterministically in
 * `bundle.barrel-cycle.known-bug.test.ts`).
 *
 * Root cause: `src/bundle/bundle.ts` imports `{ ApiSerializer, Serializer }` from the
 * `@utils/serializer` BARREL at module-eval time. That barrel transitively evaluates
 * `graphql.serializer.ts`, whose `class GraphqlSerializer extends ApiSerializer` reads
 * `ApiSerializer` off the still-initializing top barrel — yielding `undefined` under
 * ts-jest/CommonJS (`Class extends value undefined`). In production this is masked only
 * because esbuild flattens every module into a single hoisted scope.
 *
 * Why mocking is correct here (NOT hiding the unit under test): `TestBundle` OVERRIDES
 * `injectContainer()` with a fake graph, so the real `ApiSerializer`/`Serializer` are
 * never constructed or referenced by the lifecycle under characterization. They are an
 * unrelated module-load coupling pulled in only by `bundle.ts`'s top-level import. The
 * behavior actually exercised — eager `stack` population, `_const_bind` routing, lambda
 * key detection / name transformation — runs entirely through the real `PureContainer`
 * and the real `Bundle.runContainer` against `FakeLeaf`/`FakeNode`.
 *
 * This mirrors the identical, justified isolation used by the example-based lifecycle
 * suite (`bundle.lifecycle.test.ts`, Task 2.7). No production source is modified.
 */
jest.mock('@utils/serializer', () => ({
  /** Stub standing in for the real `ApiSerializer`; never invoked by `TestBundle`. */
  ApiSerializer: class ApiSerializer { },
  /** Stub standing in for the real `Serializer`; never invoked by `TestBundle`. */
  Serializer: class Serializer { },
}));

/**
 * Task 2.8 — Property-based characterization of `Bundle` stack routing and lambda naming.
 *
 * Scope: PROPERTY-BASED tests only (`fast-check`, `numRuns: 100`, shrinking enabled). The
 * example-based counterparts are owned by Task 2.7 (`bundle.lifecycle.test.ts`) and are
 * intentionally NOT duplicated here.
 *
 *   - **Property 6** (Requirement 4.6): for any tied graph, `Bundle.runContainer` populates
 *     `stack` for EVERY key, routing `_const_bind` keys through `runConstant` (raw value)
 *     and all other keys through `run` (factory construction).
 *   - **Property 7** (Requirement 4.7): for any key, `isLambdaInstance` is true iff the key
 *     starts with `lambda_` AND ends with `_factory_bind`; `lambdaToCamelName` strips those
 *     affixes and camel/pascal-cases the remaining `_`-separated segments.
 *
 * Isolation: `TestBundle` extends the production `Bundle`, so importing it evaluates
 * `src/bundle/bundle.ts` whose top-level `export const bundle = new Bundle()` is a
 * module-load side effect. Every load therefore goes through `isolatedImport`
 * (`jest.isolateModules`) so the side effect is contained (Requirement 2.2). The fakes are
 * loaded from the SAME isolated registry as `TestBundle` so `instanceof` checks compare
 * identical class references.
 *
 * Requirements: 4.6, 4.7.
 */

/** Minimum property runs mandated by the design (shrinking enabled by default). */
const NUM_RUNS = 100;

/**
 * The class/fixture references captured from a single isolated module evaluation. Loading
 * `TestBundle` and the fakes together guarantees they share one module registry, so
 * `instanceof` assertions remain valid (cross-evaluation duplicates would fail them).
 */
interface IsolatedHarness {
  TestBundle: typeof TestBundleClass;
  FakeLeaf: typeof FakeLeafType;
  FakeNode: typeof FakeNodeType;
}

/**
 * Loads `TestBundle` and the shared DI fakes inside one `jest.isolateModules` scope,
 * containing the `new Bundle()` module-load side effect and returning class references
 * that share a single realm.
 */
const loadIsolatedHarness = (): IsolatedHarness =>
  isolatedImport(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TestBundle } = require('../../test/test-harness/bundle/test-bundle');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FakeLeaf, FakeNode } = require('../../test/test-harness');
    return { TestBundle, FakeLeaf, FakeNode };
  });

describe('Bundle.runContainer — Property 6: eager stack population and `_const_bind` routing (Requirement 4.6)', () => {
  /**
   * Shared isolated realm reused across all generated cases so the `FakeLeaf` reference
   * used to BUILD the fake graph is identical to the one the constructed instances are
   * tested against (`instanceof`). Loaded once; each generated case builds a fresh graph.
   */
  let harness: IsolatedHarness;

  beforeAll(() => {
    harness = loadIsolatedHarness();
  });

  /**
   * A factory binding generator: a Di-style `*_bind` key paired with the static argument
   * the constructed `FakeLeaf` captures as its `tag`. Keys are made unique per case so
   * each binding maps to a distinct `stack`/`tied` entry.
   */
  const arbFactoryBindings = fc.uniqueArray(
    fc.record({ key: arbBindingKey, tag: fc.string() }),
    { selector: (entry: { key: string }) => entry.key, minLength: 1, maxLength: 6 },
  );

  /**
   * A constant binding generator: a `*_const_bind` key paired with the raw value bound via
   * `tieConst`. The raw value (not a constructed instance) is the discriminator proving the
   * `runConstant` route was taken.
   */
  const arbConstBindings = fc.uniqueArray(
    fc.record({ key: arbConstBindingKey, value: fc.string() }),
    { selector: (entry: { key: string }) => entry.key, minLength: 1, maxLength: 6 },
  );

  test('**Feature: library-test-coverage, Property 6** populates `stack` for every tied key, routing `_const_bind` via `runConstant` and others via `run` — **Validates: Requirements 4.6**', () => {
    const { TestBundle, FakeLeaf } = harness;

    fc.assert(
      fc.property(
        arbFactoryBindings,
        arbConstBindings,
        (
          factoryBindings: ReadonlyArray<{ key: string; tag: string }>,
          constBindings: ReadonlyArray<{ key: string; value: string }>,
        ) => {
          // Build a fake graph: `_bind` keys as factory bindings (lazy construction),
          // `_const_bind` keys as constant bindings (eager raw values).
          const factory: Record<string, unknown> = {};
          for (const { key, tag } of factoryBindings) {
            factory[key] = { instance: FakeLeaf, args: [{ value: tag }], dependencies: [] };
          }
          const constant: Record<string, unknown> = {};
          for (const { key, value } of constBindings) {
            constant[key] = { instance: FakeLeaf, args: [{ value }], dependencies: [] };
          }

          const bundle = TestBundle.withGraph({ factory, constant } as FakeGraphConfig);

          const stack = bundle.exposeStack();
          const tiedKeys = Object.keys(bundle.exposeContainer().tied ?? {});

          // Eager + total: the stack has an entry for EVERY tied key and no extras.
          expect(Object.keys(stack).sort()).toEqual(tiedKeys.sort());

          // Factory route: `_bind` keys are eagerly constructed `FakeLeaf` instances whose
          // captured `tag` equals the supplied static argument.
          for (const { key, tag } of factoryBindings) {
            const resolved = stack[key];
            expect(resolved).toBeInstanceOf(FakeLeaf);
            expect((resolved as FakeLeafType).tag).toBe(tag);
          }

          // Constant route: `_const_bind` keys yield the RAW bound value verbatim — never a
          // constructed instance. This is the discriminator proving `runConstant` routing.
          for (const { key, value } of constBindings) {
            const resolved = stack[key];
            expect(resolved).toBe(value);
            expect(resolved).not.toBeInstanceOf(FakeLeaf);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Bundle lambda helpers — Property 7: key detection and name transformation (Requirement 4.7)', () => {
  /** Single isolated bundle instance; the lambda helpers are pure over their inputs. */
  let bundle: TestBundleClass;

  beforeAll(() => {
    const { TestBundle } = loadIsolatedHarness();
    bundle = new TestBundle();
  });

  /** Lowercase-alphabetic segment (1–8 chars) from a fixed alphabet for predictable shrinking. */
  const arbSegment: fc.Arbitrary<string> = fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 1,
      maxLength: 8,
    })
    .map((chars: string[]) => chars.join(''));

  /** 1–4 snake_case segments composing the lambda name body (between the stripped affixes). */
  const arbLambdaParts: fc.Arbitrary<string[]> = fc.array(arbSegment, {
    minLength: 1,
    maxLength: 4,
  });

  /**
   * Any binding key drawn from the full key space: lambda-shaped keys (positives) plus
   * plain factory keys, constant keys, and free strings (negatives). Exercises both sides
   * of the `isLambdaInstance` predicate.
   */
  const arbAnyKey: fc.Arbitrary<string> = fc.oneof(
    arbLambdaKey,
    arbBindingKey,
    arbConstBindingKey,
    fc.string(),
  );

  /** Upper-cases only the first character of a segment, preserving the remainder verbatim. */
  const capitalize = (segment: string): string =>
    segment.charAt(0).toUpperCase() + segment.slice(1);

  test('**Feature: library-test-coverage, Property 7** `isLambdaInstance` is true iff the key starts with `lambda_` and ends with `_factory_bind` — **Validates: Requirements 4.7**', () => {
    fc.assert(
      fc.property(arbAnyKey, (key: string) => {
        const expected = key.startsWith('lambda_') && key.endsWith('_factory_bind');
        expect(bundle.runIsLambdaInstance(key)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('**Feature: library-test-coverage, Property 7** `lambdaToCamelName` strips affixes and camel/pascal-cases the remaining segments — **Validates: Requirements 4.7**', () => {
    fc.assert(
      fc.property(arbLambdaParts, (parts: string[]) => {
        const key = `lambda_${parts.join('_')}_factory_bind`;

        // Expected transformations derived from the STRUCTURED input (not by re-running the
        // production regex on the string), so the oracle is independent of the implementation.
        const expectedPascal = parts.map(capitalize).join('');
        const expectedCamel = parts
          .map((segment: string, index: number) =>
            index === 0 ? segment.toLowerCase() : capitalize(segment),
          )
          .join('');

        // Default is PascalCase.
        expect(bundle.runLambdaToCamelName(key)).toBe(expectedPascal);
        expect(bundle.runLambdaToCamelName(key, true)).toBe(expectedPascal);
        // camelCase lower-cases the first segment.
        expect(bundle.runLambdaToCamelName(key, false)).toBe(expectedCamel);

        // The affixes and the `_` separators are fully consumed by the transformation.
        expect(bundle.runLambdaToCamelName(key)).not.toContain('_');
        expect(bundle.runLambdaToCamelName(key, false)).not.toContain('_');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
