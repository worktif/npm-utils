// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

/**
 * Barrel for the external-consumer Lambda fixture.
 *
 * Spec: library-test-coverage — Task 7.1. Re-exports the consumer handler and its
 * contracts so e2e specs (tasks 7.2/7.3) import the fixture from a single, stable
 * entry point.
 */

export { handle } from './handler';
export type { LambdaConsumerEvent, LambdaConsumerResult } from './handler';
