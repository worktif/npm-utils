// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { isolatedImport } from '../../test/test-harness';

/**
 * KNOWN-BUG CHARACTERIZATION LOCK — circular-import / barrel-load defect (Requirement 3).
 *
 * What is pinned: the `@worktif/utils` library is NOT cleanly importable under plain
 * CommonJS (ts-jest / `require`) without esbuild bundling. Importing the DI core through
 * its module graph evaluates the `@utils/serializer` barrel, which transitively evaluates
 * `graphql.serializer.ts`. There, `class GraphqlSerializer extends ApiSerializer` reads
 * `ApiSerializer` from the STILL-INITIALIZING top-level `@utils/serializer` barrel, so the
 * superclass resolves to `undefined` and the class declaration throws
 * `TypeError: Class extends value undefined is not a constructor or null`.
 *
 * Why it only bites under CommonJS: production builds run through esbuild, which flattens
 * every module into a single hoisted scope, so the `extends` reference is satisfied. Under
 * per-module CommonJS evaluation the cyclic edge is traversed mid-initialization and the
 * binding is not yet defined. Priming module load order CANNOT mask this — the `extends`
 * read happens during the barrel's own first evaluation, so the barrel can never be
 * "already complete" at that moment. The cycle is structural, not order-dependent.
 *
 * Root cause (one sentence): `graphql.serializer.ts` imports its superclass `ApiSerializer`
 * through the `@utils/serializer` barrel that is itself in the middle of loading
 * `graphql.serializer.ts`, producing a self-referential barrel cycle.
 *
 * INTENDED FUTURE BEHAVIOR: the library SHOULD be importable under CommonJS without esbuild
 * bundling. The intended fix is to break the barrel cycle at the source — e.g. have
 * `graphql.serializer.ts` import `ApiSerializer` from its CONCRETE module path
 * (`@utils/serializer/services.serializer/api.services/api.serializer`) instead of the
 * top-level barrel (and likewise prime/concrete-path any other cyclic edges). When that
 * fix lands, this lock MUST be updated to assert that the import SUCCEEDS (Requirement 3.5),
 * and the `jest.mock('@utils/serializer', …)` workaround in `bundle.lifecycle.test.ts`
 * becomes unnecessary.
 *
 * Determinism: the load runs inside `jest.isolateModules` (fresh module registry per call,
 * no mock of `@utils/serializer` in this file) so the failure reproduces reliably and in
 * isolation, independent of test execution order.
 *
 * Requirements: 3.1, 3.2, 3.3 (known-bug policy: prefixed name + intended-behavior note).
 */
describe('Bundle barrel-cycle — CommonJS importability (KNOWN BUG)', () => {
  test('LOCKS KNOWN BUG: importing `@core/bundle/bundle` under CommonJS throws `Class extends value undefined` (library not importable without esbuild bundling)', () => {
    const attemptColdImport = (): void =>
      isolatedImport(() => {
        // Concrete module path (not a barrel) so the failure is attributed to the
        // production import graph itself, not to any test-side barrel indirection.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('@core/bundle/bundle');
      });

    // CURRENT (defective) behavior: the cold CommonJS import throws because
    // `GraphqlSerializer` extends an `undefined` `ApiSerializer`.
    //
    // INTENDED BEHAVIOR (flip when fixed): `expect(attemptColdImport).not.toThrow();`
    expect(attemptColdImport).toThrow(TypeError);
    expect(attemptColdImport).toThrow(/Class extends value undefined/);
  });
});
