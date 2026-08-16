// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Bundle } from '@core/bundle/bundle';
import { PureContainer } from '@core/bundle/pure.container';
import { PureTiedOptions } from '@core/bundle/pure.container.types';

import { Maybe } from '@utils/common/common.types';

import { FakeLeaf, FakeNode } from '../fakes';

/**
 * A fake dependency-injection graph shaped exactly like the production `injectContainer`
 * payload — a map of binding key → `{ instance, args, dependencies }` — but populated
 * with the dependency-free {@link FakeLeaf}/{@link FakeNode} fixtures instead of the real
 * Env/Logger/Serializer collaborators. Used to drive {@link Bundle.runContainer} without
 * pulling in production side effects.
 */
export type FakeGraph = PureTiedOptions<any, any>;

/**
 * Declarative pair of graphs handed to {@link TestBundle.injectContainer}: `factory`
 * bindings are registered via `PureContainer.tie` (lazy factory construction) and
 * `constant` bindings via `PureContainer.tieConst` (eager constant values). Either side
 * may be omitted to characterize a graph that exercises only one routing path.
 */
export interface FakeGraphConfig {
  readonly factory?: FakeGraph;
  readonly constant?: FakeGraph;
}

/**
 * Stable binding keys used by the {@link TestBundle} default fake graph. Exposed so tests
 * assert routing against shared constants rather than restating string literals.
 *
 * - `LEAF`/`NODE` end in `_bind` → routed through the factory `run` path.
 * - `CONSTANT` ends in `_const_bind` → routed through the `runConstant` path
 *   (the discriminator that proves `Bundle.runContainer` honors the `_const_bind` suffix).
 */
export const FAKE_GRAPH_KEYS = {
  LEAF: 'fake_leaf_bind',
  NODE: 'fake_node_bind',
  CONSTANT: 'fake_value_const_bind',
} as const;

/** Marker captured by the default-graph leaf, asserted by lifecycle tests. */
export const FAKE_LEAF_TAG = 'fake-leaf-tag';
/** Static argument captured by the default-graph node, asserted by lifecycle tests. */
export const FAKE_NODE_ARG = 'fake-node-arg';
/** Raw constant payload; its identity (a plain string, not a constructed `FakeLeaf`) proves `runConstant` routing. */
export const FAKE_CONST_VALUE = 'fake-const-value';

/**
 * Behavioral probe over the production {@link Bundle} that surfaces its `protected`
 * lifecycle surface for characterization without reaching into private state.
 *
 * Why this harness exists: `Bundle`'s constructor invokes the overridable `this.run()`
 * (→ `this.injectContainer()`) *before* subclass field initializers execute and *before*
 * `this.support` is assigned. That legacy "virtual call from constructor" shape is the
 * behavior under characterization, not a pattern to emulate. Because the override runs
 * during `super()`, a custom graph cannot be passed through instance state; it is instead
 * threaded through a synchronous static slot stack (see {@link TestBundle.withGraph}).
 *
 * Responsibilities:
 * - Replace the real DI graph with a fake one so {@link Bundle.runContainer} can be
 *   exercised in isolation (no Env/Logger/Serializer construction).
 * - Expose `protected` members (`stack`, `lambda`, `isLambdaInstance`, `lambdaToCamelName`)
 *   as public probes for assertions.
 *
 * @remarks Test infrastructure only. Construct synchronously; do NOT use under
 *   `test.concurrent`, as graph injection relies on a synchronous static slot.
 */
export class TestBundle extends Bundle {
  /**
   * Synchronous stack of pending graph configurations consumed by {@link injectContainer}
   * during `super()`. A stack (rather than a single slot) tolerates nested construction;
   * each entry is pushed immediately before `new TestBundle()` and popped in a `finally`.
   */
  private static readonly pendingGraphs: FakeGraphConfig[] = [];

  /**
   * Constructs a {@link TestBundle} whose lifecycle injects the supplied fake graph.
   *
   * The configuration is pushed onto a synchronous static stack, consumed by
   * {@link injectContainer} during base-class construction, and popped in a `finally`
   * block so the slot is always released — even if construction throws.
   *
   * @param config - Factory and/or constant fake bindings to register.
   * @returns A constructed {@link TestBundle} with the fake graph applied.
   */
  public static withGraph(config: FakeGraphConfig): TestBundle {
    TestBundle.pendingGraphs.push(config);
    try {
      return new TestBundle();
    } finally {
      TestBundle.pendingGraphs.pop();
    }
  }

  /**
   * The default fake graph: two factory bindings (`leaf`, and `node` depending on `leaf`)
   * plus one constant binding. Returns a fresh object per call so callers cannot mutate
   * shared fixture state.
   */
  public static defaultGraph(): Required<FakeGraphConfig> {
    return {
      factory: {
        [FAKE_GRAPH_KEYS.LEAF]: {
          instance: FakeLeaf,
          args: [{ value: FAKE_LEAF_TAG }],
          dependencies: [],
        },
        [FAKE_GRAPH_KEYS.NODE]: {
          instance: FakeNode,
          args: [{ value: FAKE_NODE_ARG }],
          dependencies: [FAKE_GRAPH_KEYS.LEAF],
        },
      },
      constant: {
        [FAKE_GRAPH_KEYS.CONSTANT]: {
          instance: FakeLeaf,
          args: [{ value: FAKE_CONST_VALUE }],
          dependencies: [],
        },
      },
    };
  }

  /**
   * Overrides the production wiring with a fake graph so {@link Bundle.runContainer} can be
   * characterized in isolation.
   *
   * Invoked from the base constructor via `this.run()`; reads the top of the synchronous
   * pending-graph stack ({@link withGraph}) and falls back to {@link defaultGraph} when the
   * bundle is constructed directly with `new TestBundle()`.
   */
  protected injectContainer(): void {
    const config: FakeGraphConfig =
      TestBundle.pendingGraphs[TestBundle.pendingGraphs.length - 1] ?? TestBundle.defaultGraph();

    if (config.factory && Object.keys(config.factory).length > 0) {
      this.container.tie(config.factory);
    }
    if (config.constant && Object.keys(config.constant).length > 0) {
      this.container.tieConst(config.constant);
    }
  }

  /**
   * Exposes the eagerly populated DI {@link Bundle.stack} (binding key → resolved value)
   * for post-construction assertions.
   */
  public exposeStack(): Record<string, Maybe<unknown>> {
    return this.stack;
  }

  /**
   * Exposes the {@link Bundle.lambda} map (binding key → bound handler promise). Empty
   * unless `tieLambdas` has run, which the standard lifecycle does not invoke.
   */
  public exposeLambda(): Record<string, Maybe<Promise<unknown>>> {
    return this.lambda;
  }

  /**
   * Invokes the `protected` {@link Bundle.tieLambdas} routine, which the standard
   * construction lifecycle never calls. It scans the tied graph, selects keys classified
   * as lambda instances by {@link Bundle.isLambdaInstance}, and binds each resolved
   * handler (`stack[key].handler`) into the {@link Bundle.lambda} map under its key.
   *
   * Exposed so characterization tests can drive the lambda-binding surface in isolation;
   * inspect the result via {@link exposeLambda}.
   */
  public runTieLambdas(): void {
    this.tieLambdas();
  }

  /** Exposes the underlying {@link PureContainer} so tests can inspect `tied` bindings. */
  public exposeContainer(): PureContainer {
    return this.container;
  }

  /**
   * Invokes the `protected` {@link Bundle.isLambdaInstance} predicate.
   *
   * @param instanceKey - Binding key to classify.
   * @returns `true` iff the key is a lambda instance per the production convention.
   */
  public runIsLambdaInstance(instanceKey: string): boolean {
    return this.isLambdaInstance(instanceKey);
  }

  /**
   * Invokes the `protected` {@link Bundle.lambdaToCamelName} transformer.
   *
   * @param raw - The `lambda_*_factory_bind` key to transform.
   * @param pascalCase - When `true` (default) produces PascalCase; otherwise camelCase.
   * @returns The affix-stripped, camel/pascal-cased name.
   */
  public runLambdaToCamelName(raw: string, pascalCase?: boolean): string {
    return this.lambdaToCamelName(raw, pascalCase);
  }
}
