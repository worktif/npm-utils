// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Bundle lifecycle probe barrel.
 *
 * Deliberately NOT re-exported from the root `test-harness` barrel: importing
 * {@link TestBundle} transitively evaluates `src/bundle/bundle.ts`, whose top-level
 * `export const bundle = new Bundle()` is a module-load side effect. Keeping this barrel
 * separate ensures the broad set of harness consumers (fakes, arbitraries, env/console
 * helpers) never trigger that side effect; lifecycle tests import this subpath directly
 * under `isolatedImport` to contain it (Requirement 2.2).
 */
export * from './test-bundle';
