// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { isolatedImport } from '../../test/test-harness';

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
 * Priming module load order CANNOT fix this edge: `GraphqlSerializer extends ApiSerializer`
 * reads `ApiSerializer` during the barrel's own first evaluation, so the barrel can never
 * be "already complete" at that point — the cycle is structural. Substituting the unused
 * barrel via `jest.mock` (test registry only, hoisted above imports by ts-jest) is the
 * minimal, faithful isolation. No production source is modified.
 *
 * Intended future behavior: the library should be importable under CommonJS without
 * esbuild bundling (e.g. `graphql.serializer` importing `ApiSerializer` from its concrete
 * module path rather than the barrel). When fixed, this mock becomes unnecessary.
 */
jest.mock('@utils/serializer', () => ({
  /** Stub standing in for the real `ApiSerializer`; never invoked by `TestBundle`. */
  ApiSerializer: class ApiSerializer { },
  /** Stub standing in for the real `Serializer`; never invoked by `TestBundle`. */
  Serializer: class Serializer { },
}));

/**
 * Task 2.7 — Cover `Bundle` lifecycle via a `TestBundle` subclass.
 *
 * Scope: EXAMPLE-BASED unit tests only. The corresponding property-based tests
 * (Property 6: eager stack population + const routing, Property 7: lambda key detection +
 * name transformation) are owned by Task 2.8 and intentionally NOT duplicated here. The
 * `LOCKS KNOWN BUG` characterization locks (e.g. the `support`-before-`run` constructor
 * defect) belong to Task 2.9 and are likewise out of scope.
 *
 * Behavior pinned (see design — "Bundle Lifecycle Probe" and Data Models):
 *   - `Bundle.runContainer` EAGERLY populates `stack` for every tied key.
 *   - keys ending in `_const_bind` route through `runConstant` (raw value), all others
 *     route through `run` (factory construction) — Requirement 4.6.
 *   - `isLambdaInstance(key)` is true iff `key` starts with `lambda_` AND ends with
 *     `_factory_bind`; `lambdaToCamelName` strips those affixes and camel/pascal-cases the
 *     remainder — Requirement 4.7.
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

describe('Bundle.runContainer — eager stack population and `_const_bind` routing (Requirement 4.6)', () => {
  test('populates `stack` for EVERY tied key after construction', () => {
    const { TestBundle } = loadIsolatedHarness();
    const bundle = new TestBundle();

    const stack = bundle.exposeStack();
    const tiedKeys = Object.keys(bundle.exposeContainer().tied ?? {});

    // The stack is built eagerly by `runContainer` during construction: every tied key
    // already has a resolved entry, with no extra keys introduced.
    expect(tiedKeys.length).toBeGreaterThan(0);
    expect(Object.keys(stack).sort()).toEqual(tiedKeys.sort());
    for (const key of tiedKeys) {
      expect(stack).toHaveProperty(key);
    }
  });

  test('routes factory (`_bind`) keys through `run`, constructing real instances', () => {
    const { TestBundle, FakeLeaf, FakeNode } = loadIsolatedHarness();
    const bundle = new TestBundle();
    const stack = bundle.exposeStack();

    // Factory keys are eagerly constructed via `new instance(...)`.
    const leaf = stack['fake_leaf_bind'] as FakeLeafType;
    const node = stack['fake_node_bind'] as FakeNodeType;

    expect(leaf).toBeInstanceOf(FakeLeaf);
    expect(leaf.tag).toBe('fake-leaf-tag');

    expect(node).toBeInstanceOf(FakeNode);
    // Static arg first, then the resolved `leaf` dependency.
    expect(node.arg).toBe('fake-node-arg');
    expect(node.dep).toBeInstanceOf(FakeLeaf);
    expect((node.dep as FakeLeafType).tag).toBe('fake-leaf-tag');
  });

  test('routes `_const_bind` keys through `runConstant`, yielding the RAW value (not a constructed instance)', () => {
    const { TestBundle, FakeLeaf } = loadIsolatedHarness();
    const bundle = new TestBundle();
    const stack = bundle.exposeStack();

    const constValue = stack['fake_value_const_bind'];

    // Discriminator: `runConstant` returns the bound value verbatim. Had this key been
    // routed through the factory `run` path, it would be a constructed `FakeLeaf` whose
    // `.tag` equals the value — so asserting the raw string proves const routing.
    expect(constValue).toBe('fake-const-value');
    expect(constValue).not.toBeInstanceOf(FakeLeaf);
    expect(typeof constValue).toBe('string');
  });

  test('applies a custom fake graph supplied via `withGraph`', () => {
    const { TestBundle, FakeLeaf } = loadIsolatedHarness();

    const config: FakeGraphConfig = {
      factory: {
        custom_leaf_bind: { instance: FakeLeaf, args: [{ value: 'custom' }], dependencies: [] },
      },
      constant: {
        custom_flag_const_bind: { instance: FakeLeaf, args: [{ value: true }], dependencies: [] },
      },
    };

    const bundle = TestBundle.withGraph(config);
    const stack = bundle.exposeStack();

    // Factory key constructed; const key returned raw.
    expect(stack['custom_leaf_bind']).toBeInstanceOf(FakeLeaf);
    expect((stack['custom_leaf_bind'] as FakeLeafType).tag).toBe('custom');
    expect(stack['custom_flag_const_bind']).toBe(true);
  });

  test('does not populate the lambda map during the standard lifecycle', () => {
    const { TestBundle } = loadIsolatedHarness();
    const bundle = new TestBundle();

    // `runContainer` only fills `stack`; `tieLambdas` is never invoked by the lifecycle,
    // so the lambda registry stays empty.
    expect(bundle.exposeLambda()).toEqual({});
  });
});

describe('Bundle.isLambdaInstance — lambda key detection (Requirement 4.7)', () => {
  let bundle: TestBundleClass;

  beforeAll(() => {
    const { TestBundle } = loadIsolatedHarness();
    bundle = new TestBundle();
  });

  test('is true only when the key starts with `lambda_` AND ends with `_factory_bind`', () => {
    expect(bundle.runIsLambdaInstance('lambda_create_user_factory_bind')).toBe(true);
    expect(bundle.runIsLambdaInstance('lambda_ping_factory_bind')).toBe(true);
  });

  test('is false when the `lambda_` prefix is missing', () => {
    expect(bundle.runIsLambdaInstance('create_user_factory_bind')).toBe(false);
    expect(bundle.runIsLambdaInstance('env_config_default_bind')).toBe(false);
  });

  test('is false when the `_factory_bind` suffix is missing', () => {
    expect(bundle.runIsLambdaInstance('lambda_create_user')).toBe(false);
    expect(bundle.runIsLambdaInstance('lambda_create_user_bind')).toBe(false);
  });

  test('is false for unrelated production keys', () => {
    expect(bundle.runIsLambdaInstance('loggerCli_plugin')).toBe(false);
    expect(bundle.runIsLambdaInstance('serializer_factory_bind')).toBe(false);
    expect(bundle.runIsLambdaInstance('')).toBe(false);
  });
});

describe('Bundle.lambdaToCamelName — affix stripping and name transformation (Requirement 4.7)', () => {
  let bundle: TestBundleClass;

  beforeAll(() => {
    const { TestBundle } = loadIsolatedHarness();
    bundle = new TestBundle();
  });

  test('defaults to PascalCase, stripping `lambda_` and `_factory_bind`', () => {
    expect(bundle.runLambdaToCamelName('lambda_create_user_factory_bind')).toBe('CreateUser');
    expect(bundle.runLambdaToCamelName('lambda_ping_factory_bind')).toBe('Ping');
    expect(bundle.runLambdaToCamelName('lambda_create_user_profile_factory_bind')).toBe(
      'CreateUserProfile',
    );
  });

  test('produces camelCase when `pascalCase` is false (first segment lower-cased)', () => {
    expect(bundle.runLambdaToCamelName('lambda_create_user_factory_bind', false)).toBe(
      'createUser',
    );
    expect(bundle.runLambdaToCamelName('lambda_ping_factory_bind', false)).toBe('ping');
    expect(bundle.runLambdaToCamelName('lambda_create_user_profile_factory_bind', false)).toBe(
      'createUserProfile',
    );
  });

  test('only strips the leading `lambda_` and trailing `_factory_bind` affixes', () => {
    // Inner segments that merely contain `lambda`/`factory` are preserved.
    expect(bundle.runLambdaToCamelName('lambda_run_lambda_factory_bind')).toBe('RunLambda');
    // Edge: stripping `^lambda_` first leaves `factory_bind`, which no longer carries the
    // leading-underscore `_factory_bind` suffix, so it survives as a segment pair.
    expect(bundle.runLambdaToCamelName('lambda_factory_bind')).toBe('FactoryBind');
  });

  test('PascalCase only upper-cases the first letter of each segment, preserving the rest verbatim', () => {
    // Current behavior: `charAt(0).toUpperCase() + slice(1)` leaves the remainder untouched.
    expect(bundle.runLambdaToCamelName('lambda_http_factory_bind')).toBe('Http');
    expect(bundle.runLambdaToCamelName('lambda_HTTP_factory_bind')).toBe('HTTP');
    // camelCase lower-cases the WHOLE first segment via `toLowerCase()`.
    expect(bundle.runLambdaToCamelName('lambda_HTTP_factory_bind', false)).toBe('http');
  });
});
