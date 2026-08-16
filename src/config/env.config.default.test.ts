// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { z, ZodType } from 'zod';

import { withEnv, isolatedImport, arbStage } from '../../test/test-harness';
import type { EnvOverrides } from '../../test/test-harness/env/with-env';

import {
  envConfigSchemaDefault,
  envConfigSchemaSupport,
  DEFAULT_AWS_REGION,
} from '@core/config/env.config.default';
import type { EnvConfigDefault as EnvConfigDefaultClass } from '@core/config/env.config.default';
import type { EnvSchemaDescriptorValues } from '@core/config/env.config.types';

/**
 * Test-only neutralization of the module-load `dotenv` side effect.
 *
 * `env.config.default.ts` executes `require('dotenv').config({ quiet: true })` at import
 * time (guarded by `!isBrowser`). Left live, that would fold a developer/CI `.env` file
 * into `process.env` and silently re-introduce keys (e.g. `AWS_ACCESS_KEY_ID`) that the
 * "absent variable" characterizations below deliberately clear — defeating the determinism
 * and "no local `.env` / machine state" contract (Requirement 2.5). Mocking `config` to a
 * no-op keeps the env exactly what `withEnv` sets, on every machine. No production source
 * is modified.
 */
jest.mock('dotenv', () => ({
  config: jest.fn((): { parsed: Record<string, never> } => ({ parsed: {} })),
}));

/** Module shape loaded fresh under {@link isolatedImport}. */
type EnvConfigModule = typeof import('@core/config/env.config.default');

/**
 * Every `process.env` key the constructor reads, pre-cleared to `undefined`. Tests spread
 * this first and then layer only the variables under test, so no ambient/leaked variable
 * influences the parse and the "absent → default" branches are exercised honestly.
 */
const CLEARED_ENV: EnvOverrides = {
  STAGE: undefined,
  PROVIDER: undefined,
  DEBUG: undefined,
  AWS_REGION: undefined,
  AWS_ACCESS_KEY_ID: undefined,
  AWS_SECRET_ACCESS_KEY: undefined,
  AWS_SESSION_TOKEN: undefined,
  CDK_DEFAULT_ACCOUNT: undefined,
  CDK_DEFAULT_REGION: undefined,
};

/** The `'dump'` sentinel the constructor substitutes for absent AWS credentials. */
const DUMP_CREDENTIAL = 'dump';

/** The STAGE fallback applied when `process.env.STAGE` is absent. */
const STAGE_DEFAULT = 'dev';

/**
 * Constructs `EnvConfigDefault` deterministically: sets `process.env` to `overrides`
 * BEFORE importing the module (Requirement 2.1), loads it in a fresh module registry so
 * load-time side effects are contained (Requirement 2.2), then constructs the instance —
 * which reads the controlled env live — and restores the environment afterwards.
 */
const buildConfig = (
  overrides: EnvOverrides,
  support?: boolean,
): Promise<EnvConfigDefaultClass> =>
  withEnv(overrides, () =>
    isolatedImport(() => {
      const { EnvConfigDefault } = require('@core/config/env.config.default') as EnvConfigModule;
      return new EnvConfigDefault(support);
    }),
  );

/** A non-empty string arbitrary; non-empty values are truthy, so they survive the
 *  constructor's `value ? value : fallback` guards rather than collapsing to a default. */
const arbNonEmpty: fc.Arbitrary<string> = fc.string({ minLength: 1 });

describe('EnvConfigDefault — config/env parsing and validation (Requirement 8)', () => {
  // ---------------------------------------------------------------------------
  // Requirement 8.1 — valid environment parses to the expected configuration.
  // ---------------------------------------------------------------------------
  describe('valid environment parsing (Requirement 8.1)', () => {
    test('maps a fully-populated environment onto the configuration surface', async () => {
      const config = await buildConfig({
        ...CLEARED_ENV,
        STAGE: 'prod',
        PROVIDER: 'unit-suite',
        DEBUG: 'true',
        AWS_REGION: 'eu-west-1',
        AWS_ACCESS_KEY_ID: 'AKIA-UNIT',
        AWS_SECRET_ACCESS_KEY: 'unit-secret',
        AWS_SESSION_TOKEN: 'unit-session',
      });

      expect(config.bundle.stage).toBe('prod');
      expect(config.bundle.provider).toBe('unit-suite');
      expect(config.bundle.debug).toBe('true');
      expect(config.defaults.aws.credentials.region).toBe('eu-west-1');
      expect(config.defaults.aws.credentials.accessKeyId).toBe('AKIA-UNIT');
      expect(config.defaults.aws.credentials.awsSecretAccessKey).toBe('unit-secret');
      expect(config.defaults.aws.credentials.awsSessionToken).toBe('unit-session');
      // Explicit credentials supplied → NOT the dump fallback.
      expect(config.isAwsCredentialsDump()).toBe(false);
    });

    /**
     * **Feature: library-test-coverage, Property 16: Valid env parses to expected config**
     * **Validates: Requirements 8.1**
     *
     * For any valid environment snapshot, the parsed configuration reflects the supplied
     * values: STAGE flows to `bundle.stage`, an optional PROVIDER round-trips (absent →
     * `undefined`), and the AWS region/access-key are carried through validation verbatim.
     */
    test('Property 16: any valid environment parses to the corresponding configuration values', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbStage,
          fc.option(arbNonEmpty, { nil: undefined }),
          arbNonEmpty,
          arbNonEmpty,
          async (stage, provider, region, accessKeyId) => {
            const config = await buildConfig({
              ...CLEARED_ENV,
              STAGE: stage,
              PROVIDER: provider,
              AWS_REGION: region,
              AWS_ACCESS_KEY_ID: accessKeyId,
            });

            expect(config.bundle.stage).toBe(stage);
            expect(config.bundle.provider).toBe(provider);
            expect(config.defaults.aws.credentials.region).toBe(region);
            expect(config.defaults.aws.credentials.accessKeyId).toBe(accessKeyId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.2 — schema validation failure behavior (pinned as-is).
  // ---------------------------------------------------------------------------
  describe('schema validation failure (Requirement 8.2)', () => {
    test('the exported default schema rejects an environment missing required AWS credentials', () => {
      const result = envConfigSchemaDefault.safeParse({
        bundle: { STAGE: 'prod' },
        aws: { cdk: {}, credentials: {} },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    test('LOCKS CURRENT BEHAVIOR: the constructor never throws, because defaults always satisfy the schema', async () => {
      // INTENDED-BEHAVIOR NOTE: the constructor builds `defaultEnv` with every
      // schema-required field pre-filled (STAGE→'dev', AWS_REGION→'us-east-1',
      // credentials→'dump'), so its internal `safeParse` cannot fail for ANY `process.env`.
      // This pins that the documented `@throws {ZodError}` path is currently unreachable via
      // construction; the reachable validation-failure surface is `setEnv` (below). If a
      // future change makes construction validation meaningful, update this expectation.
      await expect(buildConfig({ ...CLEARED_ENV })).resolves.toBeDefined();
    });

    test('setEnv throws a ZodError when the supplied environment violates its schema', async () => {
      const config = await buildConfig({ ...CLEARED_ENV });
      const requiredSchema = z.object({ TOKEN: z.string() }) as unknown as ZodType<EnvSchemaDescriptorValues>;

      let captured: unknown;
      try {
        config.setEnv({ env: { OTHER: 'value' }, schema: requiredSchema });
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeDefined();
      expect((captured as { name?: string }).name).toBe('ZodError');
      expect(Array.isArray((captured as { issues?: unknown[] }).issues)).toBe(true);
    });

    test('setEnv accepts an environment that satisfies its schema', async () => {
      const config = await buildConfig({ ...CLEARED_ENV });
      const schema = z.object({ TOKEN: z.string() }) as unknown as ZodType<EnvSchemaDescriptorValues>;

      expect(() => config.setEnv({ env: { TOKEN: 'present' }, schema })).not.toThrow();
    });

    /**
     * **Feature: library-test-coverage, Property 17: Invalid env fails validation deterministically**
     * **Validates: Requirements 8.2**
     *
     * For any environment object that violates the default schema, validation fails (never
     * silently succeeds) and does so deterministically: re-parsing the same input yields the
     * same failure with the same issue locations.
     */
    test('Property 17: any schema-violating environment fails validation deterministically', () => {
      const arbInvalidEnv: fc.Arbitrary<unknown> = fc.oneof(
        // Missing the required top-level `bundle` object.
        fc.constant({}),
        fc.constant({ aws: null }),
        // `bundle.STAGE` present but of the wrong type (number, not string).
        fc.record({ bundle: fc.record({ STAGE: fc.integer() }) }),
        // `aws` present → its `credentials` must carry the required string fields.
        fc.constant({ bundle: {}, aws: { cdk: {}, credentials: {} } }),
        // `aws.credentials.AWS_REGION` present but of the wrong type.
        fc.constant({
          bundle: {},
          aws: {
            cdk: {},
            credentials: {
              AWS_REGION: 123,
              AWS_ACCESS_KEY_ID: 'a',
              AWS_SECRET_ACCESS_KEY: 'b',
            },
          },
        }),
      );

      fc.assert(
        fc.property(arbInvalidEnv, (env) => {
          const first = envConfigSchemaDefault.safeParse(env);
          const second = envConfigSchemaDefault.safeParse(env);

          // Validation fails (the whole point of an "invalid" environment).
          expect(first.success).toBe(false);
          // Determinism: identical input → identical outcome and identical issue paths.
          expect(second.success).toBe(first.success);
          if (!first.success && !second.success) {
            const paths = (r: typeof first): string =>
              JSON.stringify(
                (r as { error: { issues: { path: PropertyKey[]; code: string }[] } }).error.issues
                  .map((issue) => ({ path: issue.path, code: issue.code }))
                  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
              );
            expect(paths(second)).toBe(paths(first));
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.3 — stage-aware defaults are preserved (pinned, not altered).
  // ---------------------------------------------------------------------------
  describe('stage-aware defaults (Requirement 8.3)', () => {
    // NOTE ON SCOPE: logger LEVEL and SAMPLING defaults are owned by `logger.ts`
    // (`sampleRateValue: 0`, `logLevel: 'INFO'`, stage→'local' fallback) and are pinned in
    // the logger phase. The stage-aware defaults OWNED BY `EnvConfigDefault` — and therefore
    // pinned here — are the STAGE fallback ('dev'), the AWS region fallback ('us-east-1'),
    // and the `'dump'` credential substitution. These tests pin them WITHOUT altering them.

    test('absent STAGE/region/credentials fall back to dev / us-east-1 / dump', async () => {
      const config = await buildConfig({ ...CLEARED_ENV });

      expect(config.bundle.stage).toBe(STAGE_DEFAULT);
      expect(config.defaults.aws.credentials.region).toBe(DEFAULT_AWS_REGION);
      expect(config.defaults.aws.credentials.accessKeyId).toBe(DUMP_CREDENTIAL);
      expect(config.defaults.aws.credentials.awsSecretAccessKey).toBe(DUMP_CREDENTIAL);
      expect(config.defaults.aws.credentials.awsSessionToken).toBe(DUMP_CREDENTIAL);
      expect(config.isAwsCredentialsDump()).toBe(true);
    });

    test('LOCKS CURRENT BEHAVIOR: the `support` flag does not change the credential fallback', async () => {
      // INTENDED-BEHAVIOR NOTE: the constructor's credential fallback is
      // `support ? this.dumpCredential : this.dumpCredential` — both branches return
      // 'dump', so `support` has no effect on the substituted credential. Pinned here as the
      // current behavior; revisit if `support` is meant to select a distinct credential.
      const withSupport = await buildConfig({ ...CLEARED_ENV }, true);
      const withoutSupport = await buildConfig({ ...CLEARED_ENV }, false);

      expect(withSupport.defaults.aws.credentials.accessKeyId).toBe(DUMP_CREDENTIAL);
      expect(withoutSupport.defaults.aws.credentials.accessKeyId).toBe(DUMP_CREDENTIAL);
      expect(withSupport.isAwsCredentialsDump()).toBe(true);
      expect(withoutSupport.isAwsCredentialsDump()).toBe(true);
    });

    /**
     * **Feature: library-test-coverage, Property 18: Stage-aware defaults are preserved**
     * **Validates: Requirements 8.3**
     *
     * For any stage, the configuration defaults applied when AWS region/credentials are
     * absent are stage-invariant: region defaults to `us-east-1`, all credentials to
     * `'dump'`, regardless of the `support` flag, while the supplied stage is preserved.
     */
    test('Property 18: stage-aware defaults are preserved across all stages and the support flag', async () => {
      await fc.assert(
        fc.asyncProperty(arbStage, fc.boolean(), async (stage, support) => {
          const config = await buildConfig({ ...CLEARED_ENV, STAGE: stage }, support);

          // The supplied stage is preserved verbatim.
          expect(config.bundle.stage).toBe(stage);
          // Defaults are unchanged and independent of the stage / support flag.
          expect(config.defaults.aws.credentials.region).toBe(DEFAULT_AWS_REGION);
          expect(config.defaults.aws.credentials.accessKeyId).toBe(DUMP_CREDENTIAL);
          expect(config.defaults.aws.credentials.awsSecretAccessKey).toBe(DUMP_CREDENTIAL);
          expect(config.defaults.aws.credentials.awsSessionToken).toBe(DUMP_CREDENTIAL);
          expect(config.isAwsCredentialsDump()).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.4 — environment is snapshotted/restored per test (via withEnv).
  // ---------------------------------------------------------------------------
  describe('environment isolation (Requirement 8.4)', () => {
    test('withEnv restores process.env after a controlled construction', async () => {
      const sentinel = '__env_config_default_sentinel__';
      expect(process.env[sentinel]).toBeUndefined();

      await buildConfig({ ...CLEARED_ENV, [sentinel]: 'temporary' });

      // The override (and all cleared keys) are restored to their pre-test state.
      expect(process.env[sentinel]).toBeUndefined();
    });

    test('the support schema accepts credentials the default schema would also accept', () => {
      // Sanity pin: both exported schemas validate a fully-populated, well-typed env.
      const env = {
        bundle: { STAGE: 'prod' },
        aws: {
          cdk: {},
          credentials: {
            AWS_REGION: 'us-east-1',
            AWS_ACCESS_KEY_ID: 'key',
            AWS_SECRET_ACCESS_KEY: 'secret',
          },
        },
      };

      expect(envConfigSchemaDefault.safeParse(env).success).toBe(true);
      expect(envConfigSchemaSupport.safeParse(env).success).toBe(true);
    });
  });
});
