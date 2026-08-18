// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { isolatedImport } from '../../test/test-harness';
import { PureContainer } from './pure.container';
import { FakeLeaf, FakeNode } from '../../test/test-harness/fakes';
import { CustomException, CustomErrorType } from '@utils/exceptions';

import type { BundleSupportProbe as BundleSupportProbeClass } from '../../test/test-harness/bundle/bundle-support-probe';

/**
 * Task 2.9 — DI-core known-bug characterization locks (Requirements 3.1, 3.2, 3.3, 3.4).
 *
 * This file PINS two current, defective DI-core behaviors as `LOCKS KNOWN BUG`
 * characterization tests. Each lock:
 *   - is prefixed with `LOCKS KNOWN BUG` in its test name (Requirement 3.1);
 *   - carries an inline note describing the INTENDED future behavior (Requirement 3.2);
 *   - asserts the CURRENT (defective) behavior so the test PASSES today and turns RED the
 *     moment the defect is fixed, forcing the lock to be flipped to the corrected
 *     contract (Requirement 3.5).
 *
 * No production source is modified. The two NEW locks here are distinct from the
 * pre-existing barrel-cycle lock in `bundle.barrel-cycle.known-bug.test.ts` (Task 2.7).
 *
 * ── TEST-ONLY WORKAROUND (barrel cycle) ──────────────────────────────────────────────
 * Lock 1 imports the production {@link Bundle} (via the {@link BundleSupportProbe}
 * subclass), which transitively evaluates the `@utils/serializer` barrel. Under
 * ts-jest/CommonJS that barrel cycle makes `class GraphqlSerializer extends ApiSerializer`
 * read an undefined superclass (`Class extends value undefined`) — a separate defect
 * pinned deterministically in `bundle.barrel-cycle.known-bug.test.ts`. Substituting the
 * unused barrel here is the minimal, faithful isolation: the `support` ordering defect
 * under characterization runs entirely through the real `Bundle` constructor /
 * `injectContainer` and the real `PureContainer`; `ApiSerializer`/`Serializer` are an
 * unrelated module-load coupling, never exercised by the assertions below.
 */
jest.mock('@utils/serializer', () => ({
  /** Stub standing in for the real `ApiSerializer`; never invoked by these locks. */
  ApiSerializer: class ApiSerializer { },
  /** Stub standing in for the real `Serializer`; never invoked by these locks. */
  Serializer: class Serializer { },
}));

/**
 * Loads the {@link BundleSupportProbe} inside a single `jest.isolateModules` scope so the
 * `export const bundle = new Bundle()` module-load side effect in `src/bundle/bundle.ts`
 * is contained per call (Requirement 2.2) and does not leak across tests.
 */
const loadSupportProbe = (): typeof BundleSupportProbeClass =>
  isolatedImport(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BundleSupportProbe } = require('../../test/test-harness/bundle/bundle-support-probe');
    return BundleSupportProbe as typeof BundleSupportProbeClass;
  });

/**
 * LOCK 1 — Requirement 3.3.
 *
 * Root cause (one sentence): `Bundle`'s constructor calls `this.run()` (→
 * `this.injectContainer()`) BEFORE executing `this.support = support`, so at the only
 * moment `support` is consumed it is still `undefined`, and `this.support ?? false`
 * collapses to `false` for every argument.
 *
 * Observable defect pinned: `new Bundle(true)` wires the `EnvConfigDefault` binding with
 * `support === false` regardless of the constructor argument. The probe records the genuine
 * production binding (it delegates to the real `injectContainer` via `super`), so the
 * asserted `args[0].value` is exactly the value the production `EnvConfigDefault` receives.
 *
 * INTENDED FUTURE BEHAVIOR (flip this lock when fixed): the constructor should assign
 * `this.support = support ?? false` BEFORE `this.run()` (or pass `support` explicitly into
 * `injectContainer`), so `new Bundle(true)` wires `EnvConfigDefault` with `support === true`
 * and `supportAtInjectionTime === true`.
 */
describe('Bundle `support` constructor ordering (KNOWN BUG — Requirement 3.3)', () => {
  /** DI key for the `EnvConfigDefault` binding (pinned literal: `Di.EnvConfigDefaultBind`). */
  const ENV_CONFIG_DEFAULT_BIND = 'env_config_default_bind';

  test('LOCKS KNOWN BUG: `new Bundle(true)` wires `EnvConfigDefault` with `support === false` because `this.run()` precedes `this.support = support`', () => {
    const BundleSupportProbe = loadSupportProbe();

    // Construct with `true`: a correct implementation would propagate `true` into the DI graph.
    const probe: BundleSupportProbeClass = new BundleSupportProbe(true);

    // (a) During `injectContainer()` (invoked from `super()` ahead of the assignment),
    //     `this.support` is still unset — the defect's mechanism.
    //     INTENDED: this should be `true`.
    expect(probe.supportAtInjectionTime).toBeUndefined();

    // (b) The recorded production `EnvConfigDefault` binding therefore captured
    //     `this.support ?? false === false`, i.e. the constructor argument was ignored.
    //     INTENDED: `args[0].value` should be `true`.
    const tied = probe.exposeContainer().tied;
    expect(tied).toBeDefined();
    const envBinding = tied![ENV_CONFIG_DEFAULT_BIND] as { args: Array<{ value: unknown }> };
    expect(envBinding).toBeDefined();
    expect(envBinding.args[0].value).toBe(false);

    // (c) The argument IS eventually stored — but only AFTER `this.run()`, too late to
    //     influence the DI wiring. This proves the value was available yet unused in time.
    expect(probe.supportAfterConstruction).toBe(true);
  });
});

/**
 * LOCK 2 — Requirement 3.4.
 *
 * Root cause (one sentence): `PureContainer.tie` resolves each binding's dependencies via
 * the `reduce` accumulator captured at that binding's declaration position
 * (`tiedAccumulated[dep].instance`), so a binding that references a dependency declared
 * LATER reads `undefined.instance` at run time and the resolution is wrapped as a
 * `CustomException.InternalError` ("invalid dependencies").
 *
 * Confirmed current behavior (verified empirically, declaration-order sensitive):
 *   - A forward reference whose dependant is NOT the first declared binding (so the
 *     accumulator is a truthy object that does not yet contain the dependency key) THROWS.
 *   - The same set of bindings declared dependency-first resolves successfully.
 * The control test below pins BOTH halves so the lock characterizes order-sensitivity
 * itself, not merely a missing binding.
 *
 * INTENDED FUTURE BEHAVIOR (flip this lock when fixed): registration/resolution should be
 * order-INSENSITIVE — a binding may declare a dependency that appears later in the same
 * `tie(...)` call and still resolve, so `run('node')` returns a fully constructed instance
 * regardless of declaration order.
 */
describe('PureContainer forward-declared dependency (KNOWN BUG — Requirement 3.4)', () => {
  test('LOCKS KNOWN BUG: a forward-declared dependency throws `CustomException.InternalError` at run time (order-sensitive registration)', () => {
    const container = new PureContainer();

    // `node` (2nd) depends on `leaf` (3rd) — a forward reference. `filler` (1st) ensures the
    // `reduce` accumulator is a truthy object at `node`'s position, so the lazy
    // `tiedAccumulated['leaf'].instance` dereference hits `undefined.instance`.
    container.tie({
      filler: { target: FakeLeaf, args: [{ value: 'filler' }], deps: [] },
      node: { target: FakeNode, args: [{ value: 'node-arg' }], deps: ['leaf'] },
      leaf: { target: FakeLeaf, args: [{ value: 'leaf-tag' }], deps: [] },
    });

    // CURRENT (defective) behavior: resolving the forward-referencing binding throws.
    // INTENDED (flip when fixed): `expect(() => container.run('node')).not.toThrow();`
    expect(() => container.run<FakeNode>('node')).toThrow(CustomException);

    let captured: CustomException | undefined;
    try {
      container.run<FakeNode>('node');
    } catch (e) {
      captured = e as CustomException;
    }

    expect(captured).toBeInstanceOf(CustomException);
    expect(captured!.code).toBe(CustomErrorType.InternalError);
    // The wrapper attributes the failure to dependency resolution...
    expect(captured!.message).toMatch(/invalid dependencies/);
    expect(captured!.message).toContain('["leaf"]');
    // ...and preserves the underlying cause (the `undefined.instance` dereference).
    expect(captured!.message).toMatch(/Cannot read properties of undefined/);
  });

  test('CONTROL (not a bug): the SAME bindings declared dependency-first resolve successfully — proving the throw above is purely order-sensitivity', () => {
    const container = new PureContainer();

    // Identical instances/args, only the declaration order changed: `leaf` before `node`.
    container.tie({
      leaf: { target: FakeLeaf, args: [{ value: 'leaf-tag' }], deps: [] },
      node: { target: FakeNode, args: [{ value: 'node-arg' }], deps: ['leaf'] },
    });

    const node = container.run<FakeNode>('node');

    expect(node).toBeInstanceOf(FakeNode);
    expect(node.arg).toBe('node-arg');
    expect(node.dep).toBeInstanceOf(FakeLeaf);
    expect(node.dep.tag).toBe('leaf-tag');
  });
});
