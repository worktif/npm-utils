// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { composeFactoryBind } from '@utils/di';

import { arbBindingKey, arbConstBindingKey, arbLambdaKey } from '../../test/test-harness';

/**
 * Task 2.2 — Property test for factory token composition.
 *
 * Scope: the single named property below. Example-based coverage for
 * `composeFactoryBind` is owned by Task 2.1 (`pure.container.utils.test.ts`) and is
 * intentionally NOT duplicated here.
 */
describe('composeFactoryBind — property-based tests', () => {
  /**
   * Binding-name input space for the property. Combines the convention-shaped keys
   * the production `Di` enum actually emits (plain factory, `_const_bind`, and
   * `lambda_*_factory_bind`) with unconstrained free-form strings — including the
   * empty string and whitespace/symbol-laden values — so totality is exercised across
   * the full string domain, not just well-formed tokens. `composeFactoryBind` accepts
   * any `keyof PureTied<T>` (a string token) and performs pure string interpolation,
   * so every `string` is a valid input.
   */
  const arbBindingName: fc.Arbitrary<string> = fc.oneof(
    arbBindingKey,
    arbConstBindingKey,
    arbLambdaKey,
    fc.string(),
    fc.constant(''),
  );

  /**
   * **Feature: library-test-coverage, Property 1: Factory token composition is total and deterministic**
   *
   * For any binding name, `composeFactoryBind(name)` returns `Factory<${name}>` and is
   * deterministic. Totality: the function is defined for every string input (it never
   * throws and always yields a string). Correctness: the output is exactly the name
   * wrapped in the `Factory<...>` envelope. Determinism: repeated calls with the same
   * input yield identical output, so the function is referentially transparent.
   *
   * **Validates: Requirements 4.1**
   */
  test('Property 1: Factory token composition is total and deterministic', () => {
    fc.assert(
      fc.property(arbBindingName, (name: string) => {
        const expected = `Factory<${name}>`;

        // Totality + correctness: defined for every input, exact envelope shape.
        const token = composeFactoryBind(name);
        expect(typeof token).toBe('string');
        expect(token).toBe(expected);

        // Determinism: repeated evaluation is identical (referential transparency).
        expect(composeFactoryBind(name)).toBe(token);
        expect(composeFactoryBind(name)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
