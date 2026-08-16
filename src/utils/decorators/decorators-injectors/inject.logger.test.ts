// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 6.1 — unit coverage for the `loggerInjector` decorator helper: logger context
 * propagation (Requirement 9.3).
 *
 * Isolation (Requirement 2.2): `loggerInjector` calls `initLog` from the `@utils/logger`
 * barrel, which transitively pulls `logger.utils.ts`'s `import { bundle } from '../../bundle'`.
 * Under ts-jest/CommonJS that barrel would evaluate `bundle.ts`'s
 * `export const bundle = new Bundle()` side effect and trip the characterized serializer
 * barrel-cycle defect. We stub `../../../bundle` (which resolves to the same `src/bundle`
 * module) with the minimal `cli.logger` surface so the injector can be unit-tested in
 * isolation. No production source is modified.
 *
 * Determinism (Requirements 2.1, 2.3, 2.4): every case runs inside `withEnv` (snapshot +
 * restore `process.env`) with `POWERTOOLS_DEV=true` so the powertools Logger writes to the
 * GLOBAL console the spies observe. `initLog` is asynchronous, so we `await` it and flush
 * microtasks with `await Promise.resolve()` before asserting captured output.
 */
jest.mock('../../../bundle', () => ({
  bundle: {
    cli: {
      logger: {
        error: jest.fn(),
        stack: jest.fn(),
      },
    },
  },
}));

import { withEnv } from '../../../../test/test-harness';
import { loggerInjector } from './inject.logger';
import { logger } from '../../logger/logger';
import { TypeDefTypes } from '../decorators.types';
import type { LoggerInterface } from '../../structure';

/** Baseline deterministic env: route powertools to the global console; no debug overrides. */
const BASE_ENV: Readonly<Record<string, string | undefined>> = {
  POWERTOOLS_DEV: 'true',
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
  STAGE: 'test',
};

describe('loggerInjector — guard (Requirement 9.3)', () => {
  test('throws when the host has no loggerInstance', async () => {
    await expect(
      loggerInjector('missing').call({ loggerInstance: undefined } as never),
    ).rejects.toThrow('Logger Instance not found.');
  });
});

describe('loggerInjector — context propagation (Requirement 9.3)', () => {
  test('returns a before_instance whose log carries the injected action context', async () => {
    await withEnv(BASE_ENV, async () => {
      const host: LoggerInterface = { loggerInstance: logger() };
      const description = 'createOrder';

      const beforeInstance = await loggerInjector(description).call(host as never);

      // The composed instance is tagged as a before_instance and exposes a LoggerInstance.
      expect(beforeInstance.typeDef).toBe(TypeDefTypes.BeforeInstance);
      expect(typeof beforeInstance.log.now).toBe('function');
      expect(typeof beforeInstance.log.future).toBe('function');

      // Context propagation: the action description becomes the structured `method` field.
      const infoSpy = jest.spyOn(console, 'info').mockImplementation((): void => undefined);
      try {
        beforeInstance.log.now({ orderId: 7 });
        await Promise.resolve();

        expect(infoSpy).toHaveBeenCalledTimes(1);
        const emitted = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
        expect(emitted.method).toBe(description);
        expect(emitted.logLevel).toBe('INFO');
        expect(emitted.details).toEqual({ orderId: 7 });
      } finally {
        infoSpy.mockRestore();
      }
    });
  });
});
