// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Bundle } from '@core/bundle/bundle';
import { PureContainer } from '@core/bundle/pure.container';

import { Maybe } from '@utils/common/common.types';

/**
 * Behavioral probe over the production {@link Bundle} that surfaces the constructor-order
 * `support` defect for known-bug characterization (Requirement 3.3) WITHOUT modifying any
 * production source.
 *
 * Unlike {@link TestBundle}, this probe does NOT replace the production DI graph: it keeps
 * the REAL {@link Bundle.injectContainer} wiring (via `super.injectContainer()`) so the
 * `EnvConfigDefault` binding it records is the genuine production binding. It adds only:
 *
 * - a capture of `this.support` AT THE MOMENT `injectContainer()` runs — which the base
 *   constructor invokes through `this.run()` *before* it executes `this.support = support`;
 * - read-only probes for the post-construction `support` field and the underlying
 *   {@link PureContainer} so tests can inspect the recorded `tied` binding spec.
 *
 * The defect this probe exposes: because `this.run()` (→ `injectContainer()`) executes
 * ahead of the `this.support = support` assignment, every `new Bundle(support)` wires
 * `EnvConfigDefault` with `support === false` regardless of the argument.
 *
 * @remarks Test infrastructure only. Field capture relies on the ES2017 emit (no
 *   `useDefineForClassFields`), so the value written during `super()` is NOT re-erased by
 *   the subclass field declaration. Construct synchronously.
 */
export class BundleSupportProbe extends Bundle {
  /**
   * Snapshot of the protected `support` field taken inside the overridden
   * {@link injectContainer}, i.e. during base-class construction and BEFORE the base
   * constructor assigns `this.support`. Stays `undefined` for every argument, which is the
   * characterized defect.
   */
  private capturedSupportAtInjectionTime?: boolean;

  /**
   * Captures `this.support` at injection time, then delegates to the REAL production wiring
   * so the recorded `EnvConfigDefault` binding reflects genuine production behavior.
   */
  protected injectContainer(): void {
    this.capturedSupportAtInjectionTime = this.support;
    super.injectContainer();
  }

  /**
   * The value of `this.support` observed while `injectContainer()` ran (during `super()`,
   * before `this.support = support`). Expected to be `undefined` — the defect.
   */
  public get supportAtInjectionTime(): Maybe<boolean> {
    return this.capturedSupportAtInjectionTime;
  }

  /**
   * The value of `this.support` after construction completes — i.e. the argument the
   * constructor eventually stored (but too late to influence the DI wiring).
   */
  public get supportAfterConstruction(): Maybe<boolean> {
    return this.support;
  }

  /** Exposes the underlying {@link PureContainer} so tests can inspect `tied` bindings. */
  public exposeContainer(): PureContainer {
    return this.container;
  }
}
