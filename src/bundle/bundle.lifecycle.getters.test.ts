// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { isolatedImport } from '../../test/test-harness';

import type { TestBundle as TestBundleClass } from '../../test/test-harness/bundle/test-bundle';
import type { FakeGraphConfig } from '../../test/test-harness/bundle/test-bundle';

/**
 * TEST-ONLY WORKAROUND for the characterized barrel-cycle defect (pinned deterministically
 * in `bundle.barrel-cycle.known-bug.test.ts`; the SAME mock the lifecycle / known-bug /
 * integration specs rely on). Importing the production `Bundle` (via `TestBundle`)
 * transitively evaluates the `@utils/serializer` barrel, whose
 * `class GraphqlSerializer extends ApiSerializer` reads an undefined superclass under
 * ts-jest/CommonJS (`Class extends value undefined`) — masked only by esbuild's single-scope
 * flattening in production. The substituted barrel is never exercised by the assertions:
 * `TestBundle` overrides `injectContainer()` with a fake graph, so the real serializer
 * subsystem is never constructed. No production source is modified.
 */
jest.mock('@utils/serializer', () => ({
  /** Stub standing in for the real `ApiSerializer`; never invoked by these tests. */
  ApiSerializer: class ApiSerializer { },
  /** Stub standing in for the real `Serializer`; never invoked by these tests. */
  Serializer: class Serializer { },
}));

/**
 * Coverage completion for the DI-core gate (Requirement 12.2) — exercises the three
 * `Bundle` members the lifecycle/known-bug/integration specs leave untouched:
 *
 *   - `tieLambdas()`  — the lambda-handler binding routine (never called by the standard
 *                       construction lifecycle, so previously 0% covered);
 *   - `get cli()`     — the CLI accessor (logger + runtime formatters);
 *   - `get env()`     — the environment-config accessor.
 *
 * These are pure read/route surfaces over the eagerly-populated `stack`, so they are
 * characterized through the `TestBundle` probe against a fake graph rather than the real
 * subsystem (kept genuine in `bundle.integration.test.ts`). No production source is
 * modified; this adds tests only.
 *
 * Isolation: importing `TestBundle` evaluates `src/bundle/bundle.ts` whose top-level
 * `export const bundle = new Bundle()` is a module-load side effect, so every load goes
 * through `isolatedImport` (`jest.isolateModules`) to contain it (Requirement 2.2).
 *
 * Requirements: 12.2 (and the lifecycle surface of 4.6, 4.7).
 */

/** Marker returned by the fake lambda handler, asserted after binding. */
const HANDLER_TAG = 'cu';
/** Prefix the fake handler emits so a bound, correctly-`this`-scoped call is observable. */
const HANDLER_PREFIX = 'handler-invoked';

/**
 * Minimal lambda-shaped fixture: a class exposing a `handler` method (the contract
 * `tieLambdas` requires — "Lambda MUST have `handler` method by Interface"). The handler
 * reads `this.tag`, so a correctly `bind(lambdaHandler)`-ed reference resolves `this` to
 * the constructed instance.
 */
class FakeLambda {
  constructor(public readonly tag: string) { }

  /** Returns a marker derived from instance state to prove `this`-binding on extraction. */
  public handler(): string {
    return `${HANDLER_PREFIX}:${this.tag}`;
  }
}

/**
 * Loads `TestBundle` inside one `jest.isolateModules` scope, containing the `new Bundle()`
 * module-load side effect and returning the class reference for direct construction.
 */
const loadTestBundle = (): typeof TestBundleClass =>
  isolatedImport(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TestBundle } = require('../../test/test-harness/bundle/test-bundle');
    return TestBundle as typeof TestBundleClass;
  });

describe('Bundle.tieLambdas — lambda-handler binding (Requirement 12.2; lifecycle of 4.7)', () => {
  /**
   * A graph mixing one lambda binding (`lambda_*_factory_bind`) with one non-lambda
   * factory binding, so `tieLambdas` exercises BOTH branches of its `isLambdaInstance`
   * filter in a single run.
   */
  const lambdaGraph: FakeGraphConfig = {
    factory: {
      lambda_create_user_factory_bind: {
        target: FakeLambda,
        args: [{ value: HANDLER_TAG }],
        deps: [],
      },
      plain_service_bind: {
        target: FakeLambda,
        args: [{ value: 'not-a-lambda' }],
        deps: [],
      },
    },
  };

  test('does NOT populate the lambda map until `tieLambdas` is invoked', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph(lambdaGraph);

    // The standard lifecycle fills only `stack`; `lambda` stays empty until tieLambdas runs.
    expect(bundle.exposeLambda()).toEqual({});
    // The lambda instance WAS eagerly constructed into the stack, though.
    expect(bundle.exposeStack()['lambda_create_user_factory_bind']).toBeInstanceOf(FakeLambda);
  });

  test('binds ONLY lambda-classified keys, ignoring non-lambda bindings', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph(lambdaGraph);

    bundle.runTieLambdas();
    const lambda = bundle.exposeLambda();

    // `plain_service_bind` is not `lambda_*_factory_bind`, so it is skipped (false branch);
    // only the lambda key is routed into the map (true branch).
    expect(Object.keys(lambda)).toEqual(['lambda_create_user_factory_bind']);
  });

  test('binds the resolved handler with its instance `this`, yielding a callable handler', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph(lambdaGraph);

    bundle.runTieLambdas();
    const bound = bundle.exposeLambda()['lambda_create_user_factory_bind'] as unknown as () => string;

    // The map stores `instance.handler.bind(instance)`; invoking it resolves `this.tag`,
    // proving the handler was extracted from the stacked instance and correctly bound.
    expect(typeof bound).toBe('function');
    expect(bound()).toBe(`${HANDLER_PREFIX}:${HANDLER_TAG}`);
  });
});

describe('Bundle.cli / Bundle.env accessors — stack routing (Requirement 12.2)', () => {
  test('`cli` returns the logger + runtime-formatter slots read from the stack', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph(TestBundle.defaultGraph());

    const cli = bundle.cli;

    // The accessor composes a stable shape from `stack` lookups. The default fake graph
    // does not register the real `Di.LoggerCli_*` keys, so the slots resolve to `undefined`
    // — the routing structure itself is what is under characterization here.
    expect(cli).toEqual({
      logger: undefined,
      loggerFormatter: {
        local: undefined,
        shortened: undefined,
        aws: undefined,
      },
    });
  });

  test('`cli` surfaces the stacked value when its DI key is present in the graph', () => {
    const TestBundle = loadTestBundle();

    // Bind the real CLI-logger DI key (`Di.LoggerCli_plugin` → `loggerCli_plugin`) so the
    // accessor returns a concrete stacked value rather than `undefined`.
    const graph: FakeGraphConfig = {
      factory: {
        loggerCli_plugin: {
          target: FakeLambda,
          args: [{ value: 'logger' }],
          deps: [],
        },
      },
    };
    const bundle = TestBundle.withGraph(graph);

    expect(bundle.cli.logger).toBeInstanceOf(FakeLambda);
    expect((bundle.cli.logger as unknown as FakeLambda).tag).toBe('logger');
  });

  test('`env` returns the value stacked under the env-config DI key', () => {
    const TestBundle = loadTestBundle();

    // Bind the env-config DI key (`Di.EnvConfigDefaultBind` → `env_config_default_bind`).
    const graph: FakeGraphConfig = {
      factory: {
        env_config_default_bind: {
          target: FakeLambda,
          args: [{ value: 'env' }],
          deps: [],
        },
      },
    };
    const bundle = TestBundle.withGraph(graph);

    expect(bundle.env).toBeInstanceOf(FakeLambda);
    expect((bundle.env as FakeLambda).tag).toBe('env');
  });

  test('`env` resolves to `undefined` when the env-config key is absent from the graph', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph({
      factory: {
        unrelated_bind: { target: FakeLambda, args: [{ value: 'x' }], deps: [] },
      },
    });

    expect(bundle.env).toBeUndefined();
  });
});

describe('Bundle lifecycle — branch completion (Requirement 12.2)', () => {
  test('constructor coerces a nullish `support` argument to `false` (the `?? false` fallback)', () => {
    const TestBundle = loadTestBundle();

    // The default parameter (`support = false`) only fires for `undefined`; passing `null`
    // exercises the SEPARATE `this.support = support ?? false` nullish-fallback branch.
    const bundle = new TestBundle(null as unknown as boolean);

    // Construction completes and the fake default graph still populates the stack.
    expect(Object.keys(bundle.exposeStack()).length).toBeGreaterThan(0);
  });

  test('an EMPTY graph leaves `container.tied` unset, exercising the falsy `runContainer` guard', () => {
    const TestBundle = loadTestBundle();

    // Both sides empty → `injectContainer` ties nothing → `container.tied` stays undefined,
    // so `runContainer`'s `if (this.container.tied)` takes its FALSE branch and `stack`
    // remains empty (no keys resolved).
    const bundle = TestBundle.withGraph({ factory: {}, constant: {} });

    expect(bundle.exposeContainer().tied).toBeUndefined();
    expect(bundle.exposeStack()).toEqual({});
  });

  test('`tieLambdas` takes its falsy `container.tied` guard when nothing is tied', () => {
    const TestBundle = loadTestBundle();
    const bundle = TestBundle.withGraph({ factory: {}, constant: {} });

    // With no tied graph, `tieLambdas`'s `if (this.container.tied)` is false → it is a no-op
    // and the lambda map stays empty (no iteration, no binding).
    expect(() => bundle.runTieLambdas()).not.toThrow();
    expect(bundle.exposeLambda()).toEqual({});
  });
});
