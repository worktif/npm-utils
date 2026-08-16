// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 3.2 — property-based coverage for logger level gating + Error serialization
 * (Requirements 5.1, 5.3). Mirrors the isolation strategy established by Task 3.1's
 * `logger.test.ts`: the logger factory transitively imports `logger.utils.ts`, which
 * imports the `@core/bundle` barrel (`import { bundle } from '../../bundle'`). Under
 * ts-jest/CommonJS that barrel evaluates `bundle.ts`'s `export const bundle = new Bundle()`
 * side effect and trips the characterized serializer barrel-cycle defect. We stub
 * `../../bundle` with the minimal `cli.logger` surface so the factory + `initLog` can be
 * exercised in isolation. No production source is modified; the mock path resolves to the
 * same `src/bundle` module the unit imports.
 */
jest.mock('../../bundle', () => ({
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
import { Logger } from '@aws-lambda-powertools/logger';

import { withEnv, captureConsole } from '../../../test/test-harness';
import type { ConsoleRecords } from '../../../test/test-harness';
import { initLog, logger } from './logger';
import { LoggerLevel } from './logger.types';
import { RuntimeLoggerFormatter } from './logger.formatter/runtime.logger.formatter/runtime.logger.formatter';
import { RuntimeLogFormatterProvider } from './logger.formatter/runtime.logger.formatter/runtime.logger.formatter.types';

/**
 * Baseline deterministic env: route powertools to the GLOBAL `console` (so the spies can
 * observe emissions), keep DEBUG suppressed, and pin a stable stage. Snapshotted/restored by
 * `withEnv` per case (Requirement 2.1).
 */
const BASE_ENV: Readonly<Record<string, string | undefined>> = {
  POWERTOOLS_DEV: 'true',
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
  STAGE: 'test',
};

/** Action label asserted back in the structured output's `method` field. */
const ACTION = 'gatedAction';

/**
 * Levels that, with `RUNTIME_DEBUG` unset, are no-ops on a default (INFO) logger:
 * - `Debug` short-circuits before any sink is touched.
 * - `Silent` maps to the `debug` method (`defineLogType`), which the factory overrides to a
 *   no-op, so nothing is emitted.
 */
const DISABLED_LEVELS: ReadonlySet<LoggerLevel> = new Set<LoggerLevel>([
  LoggerLevel.Debug,
  LoggerLevel.Silent,
]);

/** Levels that emit exactly one structured record on a default (INFO) logger. */
const ENABLED_LEVELS: readonly LoggerLevel[] = [
  LoggerLevel.Info,
  LoggerLevel.Warn,
  LoggerLevel.Error,
  LoggerLevel.Critical,
];

/** Every level the logger surface accepts — the full "log level configuration" input space. */
const arbLevel: fc.Arbitrary<LoggerLevel> = fc.constantFrom(
  ...DISABLED_LEVELS,
  ...ENABLED_LEVELS,
);

/**
 * A snake/alphabetic object key (1–8 lowercase letters). Built from a fixed alphabet so keys
 * are always valid, collision-free identifiers and never reserved tokens like `__proto__`,
 * keeping JSON round-trips and `toEqual` assertions deterministic.
 */
const arbKey: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((chars: string[]) => chars.join(''));

/** JSON-stable scalar values (no `undefined`/`NaN`) so emitted details round-trip exactly. */
const arbScalar: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

/**
 * A non-empty, flat record payload. Non-empty so the logger's `details` envelope is populated
 * (an empty object is intentionally omitted from the structured output by `logPayload`).
 */
const arbPayload: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  arbKey,
  arbScalar,
  { minKeys: 1, maxKeys: 4 },
);

/** Parse the single JSON argument emitted to a console sink. */
const parseEmitted = (call: ReadonlyArray<unknown>): Record<string, unknown> =>
  JSON.parse(call[0] as string) as Record<string, unknown>;

describe('logger — property-based level gating (Requirement 5.1)', () => {
  /**
   * **Feature: library-test-coverage, Property 9: Level gating preserves identity fallback**
   *
   * For any log level configuration, `initLog().now(payload)` ALWAYS returns the payload
   * unchanged (the identity fallback), AND:
   *  - a disabled level (`Debug`/`Silent`, with `RUNTIME_DEBUG` unset) emits nothing to any
   *    console sink, while
   *  - an enabled level emits exactly one structured record carrying `method`, `serviceName`,
   *    the matching `logLevel`, and the payload under `details`.
   *
   * **Validates: Requirements 5.1**
   */
  test('Property 9: disabled levels are no-ops; enabled levels emit structured output; identity always holds', async () => {
    await fc.assert(
      fc.asyncProperty(arbLevel, arbPayload, async (level, payload) => {
        await withEnv(BASE_ENV, async () => {
          const records: ConsoleRecords = captureConsole();
          // `captureConsole` spies log/warn/error; INFO routes to console.info and the
          // suppressed DEBUG path would hit console.debug, so spy those two explicitly.
          const infoSpy = jest.spyOn(console, 'info').mockImplementation((): void => undefined);
          const debugSpy = jest.spyOn(console, 'debug').mockImplementation((): void => undefined);
          try {
            const log = await initLog(logger(), ACTION, level);
            const returned = log.now(payload as never);
            await Promise.resolve();

            // Identity fallback: the exact input payload reference is returned for every level.
            expect(returned).toBe(payload);

            const emissions: ReadonlyArray<ReadonlyArray<unknown>> = [
              ...records.log,
              ...infoSpy.mock.calls,
              ...records.warn,
              ...records.error,
              ...debugSpy.mock.calls,
            ];

            if (DISABLED_LEVELS.has(level)) {
              // Disabled-level call is a pure no-op across every sink.
              expect(emissions).toHaveLength(0);
            } else {
              // Enabled-level call emits exactly one structured record.
              expect(emissions).toHaveLength(1);
              const emitted = parseEmitted(emissions[0]);
              expect(emitted.method).toBe(ACTION);
              expect(emitted.serviceName).toBe('Logs |');
              expect(emitted.logLevel).toBe(level.toUpperCase());
              expect(emitted.details).toEqual(payload);
            }
          } finally {
            debugSpy.mockRestore();
            infoSpy.mockRestore();
            records.restore();
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('logger — property-based Error serialization (Requirement 5.3)', () => {
  /**
   * **Feature: library-test-coverage, Property 10: Error serialization completeness**
   *
   * For any `Error` carrying a `message`, `name`, and `stack`, logging it through the logger
   * serializes the error into a `details` object that includes ALL THREE fields — across
   * formatter types (the default `LoggerLogsFormatter` and the AWS `RuntimeLoggerFormatter`),
   * both of which emit structured JSON to `console.error` at ERROR level.
   *
   * **Validates: Requirements 5.3**
   */
  test('Property 10: message/name/stack survive serialization across formatter types', async () => {
    const arbErrorParts = fc.record({
      message: fc.string(),
      name: fc.string({ minLength: 1 }),
      stack: fc.string({ minLength: 1 }),
    });
    const arbFormatterType = fc.constantFrom<'default' | 'aws'>('default', 'aws');

    await fc.assert(
      fc.asyncProperty(arbErrorParts, arbFormatterType, async (parts, formatterType) => {
        await withEnv(BASE_ENV, async () => {
          const records: ConsoleRecords = captureConsole();
          try {
            const error = new Error(parts.message);
            error.name = parts.name;
            error.stack = parts.stack;

            const instance: Logger =
              formatterType === 'aws'
                ? logger({
                  logFormatter: new RuntimeLoggerFormatter({
                    logsProvider: RuntimeLogFormatterProvider.Aws,
                  }) as never,
                })
                : logger();

            const log = await initLog(instance, 'onError', LoggerLevel.Error);
            log.now(error as never);
            await Promise.resolve();

            // ERROR level routes to console.error for both JSON formatter types.
            expect(records.error).toHaveLength(1);
            const details = parseEmitted(records.error[0]).details as Record<string, unknown>;

            // Completeness: all three error fields are present and faithfully serialized.
            expect(details).toBeDefined();
            expect(details.message).toBe(parts.message);
            expect(details.name).toBe(parts.name);
            expect(details.stack).toBe(parts.stack);
          } finally {
            records.restore();
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});
