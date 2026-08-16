// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Test fixture that emulates a module-load side effect (analogous to
 * `export const bundle = new Bundle()`). Its top-level code increments a counter held
 * on `globalThis` — which survives `jest.isolateModules` — so each fresh evaluation
 * yields a strictly larger {@link loadId}. This lets {@link isolatedImport} tests prove
 * the module registry is genuinely fresh on every isolated load.
 */
interface LoadCounterGlobal {
  __worktifHarnessLoadCount__?: number;
}

const counterHost = globalThis as typeof globalThis & LoadCounterGlobal;
counterHost.__worktifHarnessLoadCount__ =
  (counterHost.__worktifHarnessLoadCount__ ?? 0) + 1;

/** Monotonically increasing identifier assigned at module-load time. */
export const loadId: number = counterHost.__worktifHarnessLoadCount__;
