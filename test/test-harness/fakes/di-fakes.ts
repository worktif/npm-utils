// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Minimal, dependency-free leaf node for `PureContainer` graph construction.
 *
 * A leaf has no graph dependencies and a single positional constructor argument,
 * making it the simplest unit for exercising static-argument application in
 * {@link PureContainer.tie}/`run`. Because `PureContainer` constructs instances
 * directly via `new instance(...)` inside its factory binding (rather than through
 * Inversify property/constructor injection), no `@injectable` decorator is required.
 *
 * @example
 * ```ts
 * container.tie({
 *   leaf: { instance: FakeLeaf, args: [{ value: 'tag-a' }], dependencies: [] },
 * });
 * const leaf = container.run<FakeLeaf>('leaf');
 * expect(leaf.tag).toBe('tag-a');
 * ```
 */
export class FakeLeaf {
  /**
   * @param tag - Opaque marker captured verbatim so tests can assert that the static
   *   `args` value (after any `condition` mapping) reached the constructor unchanged.
   */
  constructor(public readonly tag: string) { }
}

/**
 * Minimal composite node that depends on a single {@link FakeLeaf}.
 *
 * `FakeNode` is the canonical fixture for pinning constructor argument ordering: the
 * container applies mapped static `args` first, then resolved `dependencies`. Its two
 * positional parameters — a free-form `arg` and a typed `dep` — let tests assert both
 * the value path (static arg) and the resolution path (graph dependency) in a single
 * construction.
 *
 * @example
 * ```ts
 * container.tie({
 *   leaf: { instance: FakeLeaf, args: [{ value: 'leaf' }], dependencies: [] },
 *   node: { instance: FakeNode, args: [{ value: 'arg' }], dependencies: ['leaf'] },
 * });
 * const node = container.run<FakeNode>('node');
 * expect(node.arg).toBe('arg');
 * expect(node.dep).toBeInstanceOf(FakeLeaf);
 * ```
 */
export class FakeNode {
  /**
   * @param arg - Static argument value, supplied ahead of resolved dependencies.
   * @param dep - Resolved graph dependency, supplied after all static arguments.
   */
  constructor(
    public readonly arg: unknown,
    public readonly dep: FakeLeaf,
  ) { }
}

/** Stable error message thrown by {@link ThrowingCtor}; asserted by error-surface tests. */
export const THROWING_CTOR_MESSAGE = 'ctor-failure';

/**
 * Fixture whose constructor always throws, used to drive the container's
 * construction-failure path toward a `CustomException.InternalError` surface.
 *
 * The thrown message is exported as {@link THROWING_CTOR_MESSAGE} so tests can assert
 * that the original cause is preserved through the container's error wrapping without
 * hard-coding a string literal in multiple places.
 *
 * @throws {Error} Always, with message {@link THROWING_CTOR_MESSAGE}.
 */
export class ThrowingCtor {
  constructor() {
    throw new Error(THROWING_CTOR_MESSAGE);
  }
}
