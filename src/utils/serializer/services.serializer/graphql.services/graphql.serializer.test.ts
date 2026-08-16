// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * `GraphqlSerializer` imports `logger` from `@utils/logger`, which transitively imports the
 * `@core/bundle` barrel (`logger.utils.ts → ../../bundle`). Under ts-jest/CommonJS that barrel
 * evaluates `export const bundle = new Bundle()` and trips the characterized barrel-cycle
 * defect. We stub `../../../../bundle` with the minimal `cli.logger` surface the logger factory
 * needs — the established isolation pattern from `logger.test.ts`. No production source is
 * modified; the mock resolves to the same `src/bundle` module the units import.
 */
jest.mock('../../../../bundle', () => ({
  bundle: {
    cli: {
      logger: {
        error: jest.fn(),
        stack: jest.fn(),
      },
    },
  },
}));

import * as fc from 'fast-check';

import { withEnv } from '../../../../../test/test-harness';

// Prime the concrete `ApiSerializer` superclass into the module registry BEFORE the
// `GraphqlSerializer` module (which reads `ApiSerializer` off the `@utils/serializer`
// barrel) is evaluated. This guarantees the `extends` binding is defined and keeps the
// import deterministic and independent of test execution order.
import { ApiSerializer } from '../api.services/api.serializer';
import { GraphqlSerializer } from './graphql.serializer';

/**
 * Task 4.1 — Cover the GraphQL serializer (Requirement 6.2: transformation behavior).
 *
 * Characterization scope: `GraphqlSerializer` adds a configured `loggerInstance` and otherwise
 * INHERITS the `ApiSerializer` transformation surface unchanged. It overrides no `identity`
 * behavior, so its documented "transformation" is the inherited reference-preserving identity.
 * These tests pin that inheritance and the presence of a usable logger instance.
 *
 * Determinism / isolation (Requirement 2.1): construction runs inside `withEnv` with
 * `POWERTOOLS_DEV=true` (route the powertools Logger to the global console) and a fixed stage,
 * so the logger factory never reads developer-machine env or a local `.env`.
 */

/** Baseline deterministic env mirroring the logger unit suite. */
const BASE_ENV: Readonly<Record<string, string | undefined>> = {
  POWERTOOLS_DEV: 'true',
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
  STAGE: 'test',
};

describe('GraphqlSerializer — inheritance and transformation (Requirement 6.2)', () => {
  test('is an instance of ApiSerializer (extends the API serializer)', async () => {
    await withEnv(BASE_ENV, () => {
      const gql = new GraphqlSerializer();
      expect(gql).toBeInstanceOf(GraphqlSerializer);
      expect(gql).toBeInstanceOf(ApiSerializer);
    });
  });

  test('inherits identity as a reference-preserving pass-through for success and error inputs', async () => {
    await withEnv(BASE_ENV, () => {
      const gql = new GraphqlSerializer();

      const success = { data: { id: 'g-1' }, statusCode: 200 };
      const failure = { error: { message: 'nope' }, statusCode: 400 };

      expect(gql.identity<typeof success, typeof success>(success)).toBe(success);
      expect(gql.identity<typeof failure, typeof failure>(failure)).toBe(failure);
      expect(gql.identity<string, string>('passthrough')).toBe('passthrough');
    });
  });

  test('exposes a configured logger instance with the standard log methods', async () => {
    await withEnv(BASE_ENV, () => {
      const gql = new GraphqlSerializer();

      expect(gql.loggerInstance).toBeDefined();
      expect(typeof gql.loggerInstance.info).toBe('function');
      expect(typeof gql.loggerInstance.error).toBe('function');
    });
  });
});

describe('GraphqlSerializer — property-based inherited transformation', () => {
  /**
   * `GraphqlSerializer` inherits the API serializer response shape (Property 12). Asserting the
   * identity invariant here confirms the GraphQL subclass does NOT alter that transformation —
   * the property remains reference-preserving across arbitrary inputs.
   *
   * **Validates: Requirements 6.2**
   */
  test('inherited identity preserves reference and shape for any input', async () => {
    await withEnv(BASE_ENV, () => {
      const gql = new GraphqlSerializer();

      fc.assert(
        fc.property(fc.anything(), (input: unknown) => {
          expect(gql.identity<unknown, unknown>(input)).toBe(input);
        }),
        { numRuns: 100 },
      );
    });
  });
});
