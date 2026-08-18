// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { composeFactoryBind } from '@utils/di';
import { CustomException, CustomErrorType } from '@utils/exceptions';

import { PureContainer } from './pure.container';
import { FakeLeaf, FakeNode, ThrowingCtor, THROWING_CTOR_MESSAGE } from '../../test/test-harness';

/**
 * Task 2.3 — Cover `PureContainer.tie` / `run` construction semantics.
 *
 * Scope: EXAMPLE-BASED unit tests only, exercised against the REAL Inversify
 * framework (intrinsic dependency of `PureContainer`, never mocked — Requirement 1.2).
 * The corresponding property-based tests (Property 2: argument ordering, Property 3:
 * condition mapping, Property 8: fresh instance per run) are owned by Task 2.4 and
 * intentionally NOT duplicated here.
 *
 * Behavior pinned (see design Data Models — `PureContainer.tied` entry shape and the
 * constructor application order `new Instance(...mappedArgs, ...resolvedDeps)`):
 *   - `tie` records, per binding name, a `{ target, args, dependencies }` entry where
 *     `instance` is the Inversify binding HANDLE (not the constructed value).
 *   - `run` applies mapped static `args` first, then resolved `dependencies`.
 *   - each static arg's `condition` mapper transforms the value handed to the constructor.
 *
 * Requirements: 4.1, 4.2, 4.3.
 */

/**
 * Local probe that captures the full positional argument vector its constructor
 * receives. Used only where precise, multi-slot ordering must be asserted beyond the
 * two-slot shape of {@link FakeNode}; the shared fakes remain the canonical fixtures.
 */
class ArgOrderProbe {
  public readonly received: unknown[];

  constructor(...args: unknown[]) {
    this.received = args;
  }
}

describe('PureContainer.tie — binding registration into `tied` (Requirement 4.1)', () => {
  test('records an entry per bound name with handle, args, and dependencies', () => {
    const container = new PureContainer();
    const args = [{ value: 'tag-a' }];

    container.tie({
      leaf: { target: FakeLeaf, args, deps: [] },
    });

    expect(container.tied).toBeDefined();
    expect(container.tied).toHaveProperty('leaf');

    const entry = container.tied!.leaf;
    expect(entry.args).toBe(args);
    expect(entry.deps).toEqual([]);
  });

  test('stores the Inversify binding HANDLE in `instance`, not a constructed value', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'tag-a' }], deps: [] },
    });

    const handle = container.tied!.leaf.target;

    // The recorded handle is the fluent binding object returned by `bind().toFactory()`,
    // never an eagerly constructed `FakeLeaf`. Construction happens lazily in `run`.
    expect(handle).toBeDefined();
    expect(handle).not.toBeInstanceOf(FakeLeaf);
    expect(typeof handle).toBe('object');
  });

  test('binds each name under the `composeFactoryBind` factory token', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'tag-a' }], deps: [] },
    });

    // Resolving the factory token directly proves `tie` registered the binding under
    // `Factory<leaf>` (the `composeFactoryBind` envelope), independent of `run`.
    const factory = container.get<() => FakeLeaf>(composeFactoryBind('leaf'));
    const instance = factory();

    expect(instance).toBeInstanceOf(FakeLeaf);
    expect(instance.tag).toBe('tag-a');
  });

  test('preserves the declared dependency list verbatim in the entry', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'leaf' }], deps: [] },
      node: { target: FakeNode, args: [{ value: 'arg' }], deps: ['leaf'] },
    });

    expect(container.tied!.node.deps).toEqual(['leaf']);
    expect(container.tied!.leaf.deps).toEqual([]);
  });

  test('accumulates entries across multiple `tie` calls', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'leaf' }], deps: [] },
    });
    container.tie({
      other: { target: FakeLeaf, args: [{ value: 'other' }], deps: [] },
    });

    expect(container.tied).toHaveProperty('leaf');
    expect(container.tied).toHaveProperty('other');
  });
});

describe('PureContainer.run — constructor argument ordering (Requirement 4.2)', () => {
  test('applies static args first, then resolved dependencies', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'leaf-tag' }], deps: [] },
      node: { target: FakeNode, args: [{ value: 'static-arg' }], deps: ['leaf'] },
    });

    const node = container.run<FakeNode>('node');

    expect(node).toBeInstanceOf(FakeNode);
    // Slot 0 = mapped static arg; slot 1 = resolved dependency instance.
    expect(node.arg).toBe('static-arg');
    expect(node.dep).toBeInstanceOf(FakeLeaf);
    expect(node.dep.tag).toBe('leaf-tag');
  });

  test('orders the full vector as [...mappedArgs, ...resolvedDeps] across multiple slots', () => {
    const container = new PureContainer();

    container.tie({
      depA: { target: FakeLeaf, args: [{ value: 'A' }], deps: [] },
      depB: { target: FakeLeaf, args: [{ value: 'B' }], deps: [] },
      probe: {
        target: ArgOrderProbe,
        args: [{ value: 'arg-0' }, { value: 'arg-1' }],
        deps: ['depA', 'depB'],
      },
    });

    const probe = container.run<ArgOrderProbe>('probe');

    expect(probe.received).toHaveLength(4);
    // Two static args occupy the leading slots in declaration order...
    expect(probe.received[0]).toBe('arg-0');
    expect(probe.received[1]).toBe('arg-1');
    // ...followed by resolved dependencies in declaration order.
    expect(probe.received[2]).toBeInstanceOf(FakeLeaf);
    expect(probe.received[3]).toBeInstanceOf(FakeLeaf);
    expect((probe.received[2] as FakeLeaf).tag).toBe('A');
    expect((probe.received[3] as FakeLeaf).tag).toBe('B');
  });

  test('constructs with dependencies only when no static args are declared', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'sole-dep' }], deps: [] },
      probe: { target: ArgOrderProbe, args: [], deps: ['leaf'] },
    });

    const probe = container.run<ArgOrderProbe>('probe');

    expect(probe.received).toHaveLength(1);
    expect(probe.received[0]).toBeInstanceOf(FakeLeaf);
  });

  test('constructs with static args only when no dependencies are declared', () => {
    const container = new PureContainer();

    container.tie({
      probe: {
        target: ArgOrderProbe,
        args: [{ value: 'only-arg' }],
        deps: [],
      },
    });

    const probe = container.run<ArgOrderProbe>('probe');

    expect(probe.received).toEqual(['only-arg']);
  });
});

describe('PureContainer.run — `condition` mapper transforms the constructor value (Requirement 4.3)', () => {
  test('passes the mapped value (not the original) to the constructor', () => {
    const container = new PureContainer();

    container.tie({
      leaf: {
        target: FakeLeaf,
        args: [{ value: 'raw', condition: (v: string) => `${v}-mapped` }],
        deps: [],
      },
    });

    const leaf = container.run<FakeLeaf>('leaf');

    expect(leaf.tag).toBe('raw-mapped');
    expect(leaf.tag).not.toBe('raw');
  });

  test('invokes the condition mapper with the original arg value', () => {
    const container = new PureContainer();
    const condition = jest.fn((v: number) => v * 10);

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 7, condition }], deps: [] },
    });

    const leaf = container.run<FakeLeaf>('leaf');

    expect(condition).toHaveBeenCalledWith(7);
    expect(leaf.tag).toBe(70 as unknown as string);
  });

  test('defaults to identity when no condition is supplied (value passes through unchanged)', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'unchanged' }], deps: [] },
    });

    const leaf = container.run<FakeLeaf>('leaf');

    expect(leaf.tag).toBe('unchanged');
  });

  test('applies each arg\'s condition independently and in order', () => {
    const container = new PureContainer();

    container.tie({
      probe: {
        target: ArgOrderProbe,
        args: [
          { value: 'a', condition: (v: string) => v.toUpperCase() },
          { value: 'b' },
          { value: 3, condition: (v: number) => v + 1 },
        ],
        deps: [],
      },
    });

    const probe = container.run<ArgOrderProbe>('probe');

    expect(probe.received).toEqual(['A', 'b', 4]);
  });
});

/**
 * Task 2.5 — Cover constants and error surfaces.
 *
 * Scope: EXAMPLE-BASED unit tests only, exercised against the REAL Inversify framework
 * (intrinsic dependency of `PureContainer`, never mocked — Requirement 1.2). The
 * corresponding property-based tests (Property 4: constant binding round-trip,
 * Property 5: error surfaces on invalid args/deps/ctor) are owned by Task 2.6 and are
 * intentionally NOT duplicated here.
 *
 * Behavior pinned:
 *   - `tieConst` binds each name as an Inversify constant value `condition(value)` and
 *     records a `{ target, args, dependencies }` entry whose `instance` is the binding
 *     HANDLE (mirroring `tie`); `runConstant(name)` retrieves the bound value via the RAW
 *     name token (NOT the `composeFactoryBind` factory envelope).
 *   - Current limitation: a constant is reachable through `runConstant` but is NOT
 *     resolvable as a `tie` graph dependency, because `tie` resolves dependencies through
 *     `composeFactoryBind(dep)` — a token a constant binding never registers — so the
 *     resolution fails through the "invalid dependencies" surface.
 *   - Each of the three failure paths inside the lazily-invoked factory produces a
 *     `CustomException.InternalError`: a throwing `condition` arg mapper ("invalid
 *     arguments"), an unresolvable dependency ("invalid dependencies"), and a throwing
 *     constructor ("Pure Container Exception: ..."). The originating error is captured on
 *     the exception's `error` field; note it is NOT surfaced via `getErrorCause()` (which
 *     reflects `errorCause`, left unset on these paths).
 *
 * Requirements: 4.4, 4.5.
 */

/**
 * Reads the originating cause captured by `CustomException.InternalError`.
 *
 * The container forwards the caught error through the `error` option, which the exception
 * stores on a non-enumerable, non-public `error` field (there is no getter — `getErrorCause`
 * reflects the separate, here-unset `errorCause`). Characterization tests read it through a
 * narrow structural cast to pin that the original cause is preserved end to end.
 */
const capturedCause = (exception: CustomException): unknown =>
  (exception as unknown as { error?: unknown }).error;

/**
 * Captures the value thrown by `run`, failing the test if nothing is thrown. Keeps the
 * error-surface assertions linear (no try/catch noise) while still inspecting the concrete
 * `CustomException` instance rather than relying solely on `toThrow` matchers.
 */
const captureRunFailure = (run: () => unknown): CustomException => {
  try {
    run();
  } catch (error) {
    return error as CustomException;
  }
  throw new Error('Expected `run` to throw, but it returned normally.');
};

describe('PureContainer.tieConst / runConstant — constant round-trip (Requirement 4.4)', () => {
  test('runConstant returns the value bound by tieConst', () => {
    const container = new PureContainer();

    container.tieConst({
      konst: { target: FakeLeaf, args: [{ value: 'const-value' }], deps: [] },
    });

    expect(container.runConstant<string>('konst')).toBe('const-value');
  });

  test('applies the `condition` mapper to the bound constant value', () => {
    const container = new PureContainer();

    container.tieConst({
      konst: {
        target: FakeLeaf,
        args: [{ value: 'abc', condition: (v: string) => v.toUpperCase() }],
        deps: [],
      },
    });

    expect(container.runConstant<string>('konst')).toBe('ABC');
  });

  test('defaults to identity when no condition is supplied (value passes through unchanged)', () => {
    const container = new PureContainer();
    const payload = { nested: { count: 1 } };

    container.tieConst({
      konst: { target: FakeLeaf, args: [{ value: payload }], deps: [] },
    });

    // Constants round-trip by reference — no cloning or transformation is applied.
    expect(container.runConstant<typeof payload>('konst')).toBe(payload);
  });

  test('records a `{ target, args, dependencies }` entry with the binding HANDLE', () => {
    const container = new PureContainer();
    const args = [{ value: 'const-value' }];

    container.tieConst({
      konst: { target: FakeLeaf, args, deps: [] },
    });

    expect(container.tied).toHaveProperty('konst');

    const entry = container.tied!.konst;
    expect(entry.args).toBe(args);
    expect(entry.deps).toEqual([]);
    // The stored handle is the fluent constant binding, never the raw value.
    expect(entry.target).toBeDefined();
    expect(entry.target).not.toBe('const-value');
    expect(typeof entry.target).toBe('object');
  });

  test('binds the constant under the RAW name token, not the `composeFactoryBind` envelope', () => {
    const container = new PureContainer();

    container.tieConst({
      konst: { target: FakeLeaf, args: [{ value: 'const-value' }], deps: [] },
    });

    // Retrieval succeeds through the raw name...
    expect(container.runConstant<string>('konst')).toBe('const-value');
    // ...but the `Factory<konst>` token a factory binding would use is never registered.
    expect(() => container.get(composeFactoryBind('konst'))).toThrow();
  });

  test('LIMITATION: a constant is NOT resolvable as a `tie` graph dependency', () => {
    const container = new PureContainer();

    container.tieConst({
      konst: { target: FakeLeaf, args: [{ value: 'const-dep' }], deps: [] },
    });
    container.tie({
      node: { target: FakeNode, args: [], deps: ['konst'] },
    });

    // `tie` resolves dependencies via `composeFactoryBind('konst')`, which the constant
    // binding never registered; resolution therefore fails on the dependency path.
    const failure = captureRunFailure(() => container.run<FakeNode>('node'));

    expect(failure).toBeInstanceOf(CustomException);
    expect(failure.code).toBe(CustomErrorType.InternalError);
    expect(failure.message).toContain('invalid dependencies');
  });
});

describe('PureContainer.run — CustomException.InternalError error surfaces (Requirement 4.5)', () => {
  test('invalid args: a throwing `condition` mapper yields the "invalid arguments" surface', () => {
    const container = new PureContainer();
    const argError = new Error('arg-boom');

    container.tie({
      leaf: {
        target: FakeLeaf,
        args: [{ value: 'x', condition: () => { throw argError; } }],
        deps: [],
      },
    });

    const failure = captureRunFailure(() => container.run<FakeLeaf>('leaf'));

    expect(failure).toBeInstanceOf(CustomException);
    expect(failure.code).toBe(CustomErrorType.InternalError);
    expect(failure.message).toContain('invalid arguments');
    // The originating mapper error is captured on the exception (but not via getErrorCause).
    expect(capturedCause(failure)).toBe(argError);
    expect(failure.getErrorCause()).toBeUndefined();
  });

  test('invalid dependencies: an unregistered dependency yields the "invalid dependencies" surface', () => {
    const container = new PureContainer();

    container.tie({
      node: { target: FakeNode, args: [], deps: ['ghost'] },
    });

    const failure = captureRunFailure(() => container.run<FakeNode>('node'));

    expect(failure).toBeInstanceOf(CustomException);
    expect(failure.code).toBe(CustomErrorType.InternalError);
    expect(failure.message).toContain('invalid dependencies');
  });

  test('throwing constructor: a failing `new instance(...)` yields the construction surface', () => {
    const container = new PureContainer();

    container.tie({
      boom: { target: ThrowingCtor, args: [], deps: [] },
    });

    const failure = captureRunFailure(() => container.run('boom'));

    expect(failure).toBeInstanceOf(CustomException);
    expect(failure.code).toBe(CustomErrorType.InternalError);
    expect(failure.message).toContain('Pure Container Exception:');
    // The original constructor error is preserved as the captured cause.
    const cause = capturedCause(failure);
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toBe(THROWING_CTOR_MESSAGE);
  });

  test('failure surfaces are produced lazily by `run`, not eagerly by `tie`', () => {
    const container = new PureContainer();

    // Registering a binding with a throwing constructor must not throw at tie time.
    expect(() => {
      container.tie({
        boom: { target: ThrowingCtor, args: [], deps: [] },
      });
    }).not.toThrow();

    // The failure only manifests when the factory is invoked through `run`.
    expect(() => container.run('boom')).toThrow(CustomException);
  });
});
