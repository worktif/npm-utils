// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { PureContainer } from './pure.container';
import { FakeLeaf } from '../../test/test-harness';

import type { Maybe } from '@utils/common/common.types';
import type { PureTied, PureTiedOptions } from './pure.container.types';

/**
 * The argument type `tieSingleton` actually consumes at RUNTIME: a map of binding name →
 * implementation class. NOTE: the production signature annotates this parameter as
 * `PureTiedOptions` (a `{ target, args, dependencies }` descriptor map), but the method
 * body binds the VALUE itself as the class (`.to(value).inSingletonScope()`). That
 * signature/behavior mismatch is a production quirk under characterization here; tests
 * supply the runtime-correct shape and cast through `unknown` to satisfy the compiler
 * without modifying production source.
 */
type SingletonOptions = Record<string, new (...args: never[]) => unknown>;

/** Casts a runtime-correct singleton option map to the production parameter type. */
const asSingletonOptions = (options: SingletonOptions): PureTiedOptions<any> =>
  options as unknown as PureTiedOptions<any>;

/**
 * Zero-argument implementation class for `tieSingleton`. Inversify's `.to(impl)` validates
 * constructor metadata eagerly at bind time, so the implementation must have no required
 * constructor parameters (unlike {@link FakeLeaf}, whose required `tag` arg is rejected).
 */
class SingletonService {
  /** Stable marker proving the resolved singleton is a genuine instance of this class. */
  public readonly kind = 'singleton-service';
}

/**
 * Coverage completion for the DI-core gate (Requirement 12.2) — exercises the three
 * `PureContainer` members the construction/constants/error specs (Tasks 2.3 / 2.5) leave
 * untouched:
 *
 *   - `tieSingleton(options)` — singleton-scoped Inversify binding registration (a binding
 *     style distinct from the factory `tie` / constant `tieConst` paths already covered);
 *   - `setArg(value, condition)` — the deferred `{ value, condition }` arg builder;
 *   - `merge(nextTied)` — the pure `tied`-overlay merge.
 *
 * Scope: EXAMPLE-BASED unit tests against the REAL Inversify framework (intrinsic
 * dependency of `PureContainer`, never mocked — Requirement 1.2). No production source is
 * modified; this adds tests only.
 *
 * Requirements: 12.2 (binding/merge surface of 4.1).
 */

/**
 * Narrow probe subclass exposing the `protected` {@link PureContainer.setArg} builder so
 * its `{ value, condition }` shape — and the deferred `condition()` thunk it wraps — can be
 * characterized without reaching into private state. Test infrastructure only.
 */
class ProbeContainer extends PureContainer {
  /**
   * Invokes the `protected` `setArg`.
   *
   * @param value - The value to capture.
   * @param condition - Predicate/mapper deferred behind the returned `condition` thunk.
   * @returns The `{ value, condition }` pair produced by `setArg`.
   */
  public callSetArg<V>(value: V, condition: (v: V) => Maybe<V>): { value: V; condition: () => Maybe<V> } {
    return this.setArg(value, condition);
  }
}

describe('PureContainer.tieSingleton — singleton-scoped binding registration (Requirement 12.2)', () => {
  test('records a `tied` entry per bound name (binding HANDLE, not a constructed value)', () => {
    const container = new PureContainer();

    // `tieSingleton` binds the option VALUE itself as the implementation class
    // (`.to(instance).inSingletonScope()`), unlike `tie`/`tieConst` which destructure a
    // `{ target, args, dependencies }` descriptor.
    container.tieSingleton(asSingletonOptions({ leaf: SingletonService }));

    expect(container.tied).toBeDefined();
    expect(container.tied).toHaveProperty('leaf');

    const handle = container.tied!.leaf as unknown;
    expect(handle).toBeDefined();
    // The stored value is the fluent Inversify binding handle, never an eager instance.
    expect(handle).not.toBeInstanceOf(SingletonService);
    expect(typeof handle).toBe('object');
  });

  test('merges into existing `tied` and accumulates across calls', () => {
    const container = new PureContainer();

    container.tieSingleton(asSingletonOptions({ a: SingletonService }));
    container.tieSingleton(asSingletonOptions({ b: SingletonService }));

    expect(container.tied).toHaveProperty('a');
    expect(container.tied).toHaveProperty('b');
  });

  test('binds each name under its RAW token so Inversify can resolve the singleton', () => {
    const container = new PureContainer();

    container.tieSingleton(asSingletonOptions({ leaf: SingletonService }));

    const first = container.get<SingletonService>('leaf');
    const second = container.get<SingletonService>('leaf');

    expect(first).toBeInstanceOf(SingletonService);
    // Singleton scope: repeated resolutions return the SAME instance.
    expect(first).toBe(second);
  });
});

describe('PureContainer.setArg — deferred `{ value, condition }` builder (Requirement 12.2)', () => {
  test('captures the value and defers the condition behind a zero-arg thunk', () => {
    const probe = new ProbeContainer();
    const condition = jest.fn((v: number): Maybe<number> => (v > 3 ? v : undefined));

    const arg = probe.callSetArg(5, condition);

    // The value is captured verbatim; the condition is NOT evaluated at build time.
    expect(arg.value).toBe(5);
    expect(condition).not.toHaveBeenCalled();
    expect(typeof arg.condition).toBe('function');

    // Invoking the thunk applies the original captured value to the condition.
    expect(arg.condition()).toBe(5);
    expect(condition).toHaveBeenCalledWith(5);
  });

  test('the deferred thunk surfaces a falsy condition result unchanged', () => {
    const probe = new ProbeContainer();

    const arg = probe.callSetArg(1, (v: number): Maybe<number> => (v > 3 ? v : undefined));

    expect(arg.value).toBe(1);
    // The thunk forwards whatever the condition returns — here `undefined`.
    expect(arg.condition()).toBeUndefined();
  });
});

describe('PureContainer.merge — pure `tied` overlay (Requirement 12.2)', () => {
  test('overlays `nextTied` on top of the current `tied`, returning a new object', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'leaf' }], deps: [] },
    });

    const nextTied = {
      extra: { target: {}, args: [], deps: [] },
    } as unknown as PureTied<string>;

    const merged = container.merge(nextTied);

    // Both the pre-existing and the overlaid keys are present in the merged result...
    expect(merged).toHaveProperty('leaf');
    expect(merged).toHaveProperty('extra');
    // ...and `merge` does not mutate the live `tied` (the overlay is a pure copy).
    expect(container.tied).not.toHaveProperty('extra');
  });

  test('later keys in `nextTied` win over identically-named existing entries', () => {
    const container = new PureContainer();

    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'original' }], deps: [] },
    });

    const replacement = { sentinel: true } as unknown;
    const merged = container.merge({ leaf: replacement } as unknown as PureTied<string>);

    // The overlay value for `leaf` replaces the original binding handle.
    expect(merged.leaf).toBe(replacement);
  });

  test('returns a shallow overlay even when the current `tied` is empty', () => {
    const container = new PureContainer();

    const nextTied = {
      only: { target: {}, args: [], deps: [] },
    } as unknown as PureTied<string>;

    const merged = container.merge(nextTied);

    expect(merged).toHaveProperty('only');
  });
});

/**
 * `tie` and `tieConst` both open with a self-delegation guard:
 *
 *   const proto = Object.getPrototypeOf(Object.getPrototypeOf(this));
 *   if (proto && 'tied' in proto && 'tieConst' in proto) { proto.tie(options, ...args); }
 *
 * For a direct `new PureContainer()` the double-prototype is `Container.prototype`, which
 * carries neither `tied` nor `tieConst`, so the guard is always FALSE on the supported
 * construction path (covered by every other spec). Its TRUE branch is only reachable when
 * the double-prototype both inherits `tieConst` (from `PureContainer`) AND owns a `tied`
 * marker — a shape that never occurs in production (PureContainer is not subclassed, and
 * `tied` is a per-instance field, never present on any prototype in the chain).
 *
 * These tests pin that defective self-delegation branch by constructing a two-level
 * subclass whose INTERMEDIATE prototype is given an own `tied` marker, forcing the guard
 * TRUE. The delegated call then runs the binding logic with `this` bound to a prototype
 * object (which lacks Inversify's instance state), so it surfaces a `TypeError` — the
 * observable signature of this dead-by-construction path. Marking the intermediate
 * prototype (a LOCAL subclass) never touches the production `PureContainer.prototype`.
 *
 * Requirements: 12.2 (branch completion of the `tie`/`tieConst` guards).
 */
describe('PureContainer self-delegation guard — `tie`/`tieConst` proto recursion (Requirement 12.2)', () => {
  /** Intermediate subclass whose prototype we mark with an own `tied`. */
  class MidContainer extends PureContainer { }
  /** Leaf subclass so `getPrototypeOf(getPrototypeOf(instance))` resolves to `MidContainer.prototype`. */
  class LeafContainer extends MidContainer { }

  beforeAll(() => {
    // Own `tied` on the intermediate prototype → satisfies `'tied' in proto`; `tieConst`/`tie`
    // are inherited from `PureContainer.prototype` → satisfies `'tieConst' in proto`.
    Object.defineProperty(MidContainer.prototype, 'tied', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    delete (MidContainer.prototype as { tied?: unknown }).tied;
  });

  test('`tie` enters the self-delegation branch (guard TRUE) and surfaces a TypeError from the prototype-bound call', () => {
    const leaf = new LeafContainer();

    expect(() =>
      leaf.tie({
        x: { target: FakeLeaf, args: [{ value: 'x' }], deps: [] },
      }),
    ).toThrow(TypeError);
  });

  test('`tieConst` enters the self-delegation branch (guard TRUE) and surfaces a TypeError from the prototype-bound call', () => {
    const leaf = new LeafContainer();

    expect(() =>
      leaf.tieConst({
        x: { target: FakeLeaf, args: [{ value: 'x' }], deps: [] },
      }),
    ).toThrow(TypeError);
  });
});
