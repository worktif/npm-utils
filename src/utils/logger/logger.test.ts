// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * The logger factory transitively imports `logger.utils.ts`, which imports the
 * `@core/bundle` barrel (`import { bundle } from '../../bundle'`). Under ts-jest/CommonJS
 * that barrel evaluates `bundle.ts`'s `export const bundle = new Bundle()` side effect and
 * trips the characterized serializer barrel-cycle defect (`Class extends value undefined`,
 * pinned in `bundle.barrel-cycle.known-bug.test.ts`). We stub `../../bundle` with the minimal
 * `cli.logger` surface so the factory + `initLog` can be unit-tested in isolation. No
 * production source is modified; the mock path resolves to the same `src/bundle` module the
 * unit imports.
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

import { Logger } from '@aws-lambda-powertools/logger';

import { withEnv, captureConsole } from '../../../test/test-harness';
import type { ConsoleRecords } from '../../../test/test-harness';
import { initLog, logger } from './logger';
import { LoggerLevel } from './logger.types';

/**
 * Task 3.1 — unit coverage for the logger factory and `initLog` (Requirement 5.1: level
 * handling, identity fallbacks, structured output fields).
 *
 * Determinism / isolation (Requirement 2.1, 2.3, 2.4): every case runs inside `withEnv`,
 * which snapshots and restores `process.env`, and uses `captureConsole` to spy the console
 * sinks. We always set `POWERTOOLS_DEV=true` so the powertools Logger writes to the GLOBAL
 * `console` (otherwise it instantiates its own private `Console` bound to stdout/stderr that
 * the spies cannot observe). `initLog` is asynchronous, so we `await` it and flush microtasks
 * with `await Promise.resolve()` before asserting on captured output (Requirement 2.4).
 */

/** Baseline deterministic env: route powertools to the global console; no debug, no overrides. */
const BASE_ENV: Readonly<Record<string, string | undefined>> = {
  POWERTOOLS_DEV: 'true',
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
  STAGE: 'test',
};

/** Parse the single JSON argument the logger emits to a given console sink call. */
const parseEmitted = (call: ReadonlyArray<unknown>): Record<string, unknown> =>
  JSON.parse(call[0] as string) as Record<string, unknown>;

describe('logger() factory — level handling', () => {
  test('defaults to INFO when neither config nor env specify a level', async () => {
    await withEnv(BASE_ENV, () => {
      expect(logger().getLevelName()).toBe('INFO');
    });
  });

  test('honors an explicit config.logLevel', async () => {
    await withEnv(BASE_ENV, () => {
      expect(logger({ logLevel: 'ERROR' }).getLevelName()).toBe('ERROR');
    });
  });

  test('falls back to process.env.LOG_LEVEL when config omits the level', async () => {
    await withEnv({ ...BASE_ENV, LOG_LEVEL: 'WARN' }, () => {
      expect(logger().getLevelName()).toBe('WARN');
    });
  });

  test('config.logLevel takes precedence over process.env.LOG_LEVEL', async () => {
    await withEnv({ ...BASE_ENV, LOG_LEVEL: 'WARN' }, () => {
      expect(logger({ logLevel: 'ERROR' }).getLevelName()).toBe('ERROR');
    });
  });
});

describe('logger() factory — DEBUG suppression', () => {
  test('overrides debug() to a no-op when RUNTIME_DEBUG is not enabled', async () => {
    await withEnv(BASE_ENV, () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const instance: Logger = logger({ logLevel: 'DEBUG' });
        instance.debug('should be swallowed');

        // The factory replaced debug() with a silent no-op: nothing reaches any sink.
        expect(records.log).toHaveLength(0);
        expect(records.warn).toHaveLength(0);
        expect(records.error).toHaveLength(0);
      } finally {
        records.restore();
      }
    });
  });
});

describe('initLog().now() — structured output fields', () => {
  test('emits method, message, level, serviceName, and details for an object payload', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'createOrder', LoggerLevel.Error);
        log.now({ orderId: 42, currency: 'EUR' });
        await Promise.resolve();

        expect(records.error).toHaveLength(1);
        const emitted = parseEmitted(records.error[0]);
        expect(emitted.method).toBe('createOrder');
        expect(emitted.logLevel).toBe('ERROR');
        expect(emitted.serviceName).toBe('Logs |');
        expect(emitted.message).toEqual(expect.any(String));
        expect(emitted.details).toEqual({ orderId: 42, currency: 'EUR' });
      } finally {
        records.restore();
      }
    });
  });

  test('surfaces a custom logger serviceName in the structured output', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger({ serviceName: 'Billing' }), 'charge', LoggerLevel.Error);
        log.now({ amount: 10 });
        await Promise.resolve();

        expect(parseEmitted(records.error[0]).serviceName).toBe('Billing');
      } finally {
        records.restore();
      }
    });
  });

  test('wraps details under the provided tag', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'tagged', LoggerLevel.Error);
        log.now({ value: 1 }, { tag: 'request', level: LoggerLevel.Error });
        await Promise.resolve();

        expect(parseEmitted(records.error[0]).details).toEqual({ request: { value: 1 } });
      } finally {
        records.restore();
      }
    });
  });

  test('honors an explicit message override', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'withMessage', LoggerLevel.Error);
        log.now({ value: 1 }, { message: 'custom-message', level: LoggerLevel.Error });
        await Promise.resolve();

        expect(parseEmitted(records.error[0]).message).toBe('custom-message');
      } finally {
        records.restore();
      }
    });
  });
});

describe('initLog().now() — identity fallback and payload shaping', () => {
  test('passes the payload through unchanged (identity) and returns it when no serializer is given', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const payload = { a: 1, b: 'two' };
        const log = await initLog(logger(), 'identity', LoggerLevel.Error);
        const returned = log.now(payload);
        await Promise.resolve();

        // Identity fallback: emitted details equal the input, and the call returns the payload.
        expect(parseEmitted(records.error[0]).details).toEqual(payload);
        expect(returned).toEqual(payload);
      } finally {
        records.restore();
      }
    });
  });

  test('applies a caller-supplied serializer to the details', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'serialized', LoggerLevel.Error);
        log.now({ secret: 'hidden', keep: 'visible' }, {
          level: LoggerLevel.Error,
          serializer: (value: unknown) => ({ keep: (value as { keep: string }).keep }),
        });
        await Promise.resolve();

        expect(parseEmitted(records.error[0]).details).toEqual({ keep: 'visible' });
      } finally {
        records.restore();
      }
    });
  });

  test('serializes an Error payload into message/name/stack', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'onError', LoggerLevel.Error);
        log.now(new Error('boom'));
        await Promise.resolve();

        const details = parseEmitted(records.error[0]).details as Record<string, unknown>;
        expect(details.message).toBe('boom');
        expect(details.name).toBe('Error');
        expect(typeof details.stack).toBe('string');
      } finally {
        records.restore();
      }
    });
  });

  test('still logs a null payload (message-absent) and returns it', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'nullPayload', LoggerLevel.Error);
        const returned = log.now(null as never);
        await Promise.resolve();

        expect(records.error).toHaveLength(1);
        const emitted = parseEmitted(records.error[0]);
        expect(emitted.message).toMatch(/message is absent/);
        expect(emitted.details).toBeUndefined();
        expect(returned).toBeNull();
      } finally {
        records.restore();
      }
    });
  });

  test('routes a non-object, non-string payload to ERROR with the failure message', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'numberPayload', LoggerLevel.Info);
        log.now(42 as never);
        await Promise.resolve();

        // Numbers are neither object nor string, so the helper forces ERROR + a default message.
        expect(records.error).toHaveLength(1);
        const emitted = parseEmitted(records.error[0]);
        expect(emitted.details).toBe(42);
        expect(emitted.message).toMatch(/neither an object, nor a string/);
      } finally {
        records.restore();
      }
    });
  });
});

describe('initLog().now() — level routing', () => {
  test('routes WARN-level logs to console.warn', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'warned', LoggerLevel.Warn);
        log.now({ note: 'careful' });
        await Promise.resolve();

        expect(records.warn).toHaveLength(1);
        expect(records.error).toHaveLength(0);
        expect(parseEmitted(records.warn[0]).logLevel).toBe('WARN');
      } finally {
        records.restore();
      }
    });
  });

  test('routes INFO-level logs to console.info', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation((): void => undefined);
      try {
        const log = await initLog(logger(), 'informed', LoggerLevel.Info);
        log.now({ note: 'fyi' });
        await Promise.resolve();

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(records.warn).toHaveLength(0);
        expect(records.error).toHaveLength(0);
        expect(parseEmitted(infoSpy.mock.calls[0]).logLevel).toBe('INFO');
      } finally {
        infoSpy.mockRestore();
        records.restore();
      }
    });
  });

  test('suppresses DEBUG-level logs (returns payload, emits nothing) when RUNTIME_DEBUG is off', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation((): void => undefined);
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation((): void => undefined);
      try {
        const payload = { trace: 'detail' };
        const log = await initLog(logger(), 'debugged', LoggerLevel.Debug);
        const returned = log.now(payload);
        await Promise.resolve();

        expect(returned).toEqual(payload);
        expect(records.log).toHaveLength(0);
        expect(records.warn).toHaveLength(0);
        expect(records.error).toHaveLength(0);
        expect(infoSpy).not.toHaveBeenCalled();
        expect(debugSpy).not.toHaveBeenCalled();
      } finally {
        debugSpy.mockRestore();
        infoSpy.mockRestore();
        records.restore();
      }
    });
  });
});

describe('initLog().now() — logger configured at DEBUG while RUNTIME_DEBUG is off', () => {
  test('temporarily lowers the DEBUG logger to INFO to emit a non-debug log, then restores DEBUG', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const instance: Logger = logger({ logLevel: 'DEBUG' });
        const log = await initLog(instance, 'guarded', LoggerLevel.Error);
        log.now({ flag: true });
        await Promise.resolve();

        // The ERROR log is emitted (level was temporarily raised to INFO) ...
        expect(records.error).toHaveLength(1);
        expect(parseEmitted(records.error[0]).logLevel).toBe('ERROR');
        // ... and the original DEBUG level is restored afterwards.
        expect(instance.getLevelName()).toBe('DEBUG');
      } finally {
        records.restore();
      }
    });
  });

  test('skips a DEBUG log on a DEBUG-configured logger and restores the DEBUG level', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation((): void => undefined);
      try {
        const instance: Logger = logger({ logLevel: 'DEBUG' });
        const payload = { flag: false };
        const log = await initLog(instance, 'guardedDebug', LoggerLevel.Debug);
        const returned = log.now(payload);
        await Promise.resolve();

        expect(returned).toEqual(payload);
        expect(records.error).toHaveLength(0);
        expect(records.warn).toHaveLength(0);
        expect(debugSpy).not.toHaveBeenCalled();
        expect(instance.getLevelName()).toBe('DEBUG');
      } finally {
        debugSpy.mockRestore();
        records.restore();
      }
    });
  });
});

describe('initLog().future() — async logging', () => {
  test('awaits the promise, applies identity, and emits the resolved payload', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const log = await initLog(logger(), 'futureAction', LoggerLevel.Error);
        const returned = await log.future(Promise.resolve({ resolved: true }) as never, {
          level: LoggerLevel.Error,
        });
        await Promise.resolve();

        expect(records.error).toHaveLength(1);
        expect(parseEmitted(records.error[0]).details).toEqual({ resolved: true });
        expect(returned).toEqual({ resolved: true });
      } finally {
        records.restore();
      }
    });
  });
});
