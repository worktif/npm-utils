// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 6.1 — unit + property coverage for `catchInjector` interception surface
 * (Requirement 9.2, Property 20).
 *
 * Isolation (Requirement 2.2): `catchInjector` imports the `@utils/decorators` barrel which
 * re-exports `injectBefore`, which imports the `@utils/logger` barrel and transitively pulls
 * `logger.utils.ts`'s `import { bundle } from '../../bundle'`. Under ts-jest/CommonJS that
 * barrel would evaluate `bundle.ts`'s `export const bundle = new Bundle()` side effect and
 * trip the characterized serializer barrel-cycle defect. We stub `../../../bundle` (which
 * resolves to the same `src/bundle` module) with the minimal `cli.logger` surface so the
 * injector can be unit-tested in isolation. No production source is modified.
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

import * as fc from 'fast-check';
import { StatusCodes } from 'http-status-codes';

import { catchInjector } from './inject.catch';
import { TypeDefTypes } from '../decorators.types';
import { LoggerLevel } from '../../logger/logger.types';

/** A fake `LoggerInstance` recording `now` invocations without emitting anything. */
interface FakeLog {
  now: jest.Mock;
  future: jest.Mock;
}

const makeFakeLog = (): FakeLog => ({
  now: jest.fn(),
  future: jest.fn(),
});

/** A `before_instance` typeDef carrying a fake log — the shape `extractTypedArg` looks for. */
const makeBeforeInstance = (
  log: FakeLog,
): { typeDef: TypeDefTypes.BeforeInstance; log: FakeLog } => ({
  typeDef: TypeDefTypes.BeforeInstance,
  log,
});

describe('catchInjector — logging branch (Requirement 9.2)', () => {
  test('forwards the error to beforeInstance.log.now with the message and ERROR level', async () => {
    const log = makeFakeLog();
    const beforeInstance = makeBeforeInstance(log);
    const error = new Error('boom');

    await expect(
      catchInjector('handled-message')(error as never, beforeInstance as never),
    ).rejects.toBe(error);

    expect(log.now).toHaveBeenCalledTimes(1);
    expect(log.now).toHaveBeenCalledWith(error, {
      message: 'handled-message',
      level: LoggerLevel.Error,
    });
  });

  test('falls back to console.error (twice) when no beforeInstance log is present', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    const error = new Error('no-log');

    try {
      // No before_instance in args → beforeInstance?.log is undefined → console fallback.
      await expect(catchInjector('msg')(error as never)).rejects.toBe(error);

      // The injector logs the raw error and its JSON form before rethrowing.
      expect(errorSpy).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('catchInjector — REST surface (Requirement 9.2)', () => {
  test('returns an UNPROCESSABLE_ENTITY ApiResponse surface when restApi is enabled', async () => {
    const log = makeFakeLog();
    const beforeInstance = makeBeforeInstance(log);
    const error = new Error('rest-boom');

    const surface = await catchInjector('rest-message', true)(
      error as never,
      beforeInstance as never,
    );

    // restApi=true does NOT rethrow; it yields the beforeInstance fields plus an `error`
    // ApiResponse carrying the 422 status.
    const restSurface = surface as unknown as { typeDef: string; log: FakeLog; error: { statusCode: number } };
    expect(restSurface.typeDef).toBe(TypeDefTypes.BeforeInstance);
    expect(restSurface.log).toBe(log);
    expect(restSurface.error.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    // The logging branch still runs before composing the REST surface.
    expect(log.now).toHaveBeenCalledTimes(1);
  });

  test('supports a message resolver function as the first argument', async () => {
    const log = makeFakeLog();
    const beforeInstance = makeBeforeInstance(log);
    const error = new Error('fn-message');
    const resolver = (): string => 'resolved';

    await expect(
      catchInjector(resolver)(error as never, beforeInstance as never),
    ).rejects.toBe(error);

    // The closure forwards the resolver itself as the `message` option (not its result).
    expect(log.now).toHaveBeenCalledWith(error, {
      message: resolver,
      level: LoggerLevel.Error,
    });
  });
});

describe('Property 20 — catch interception surface', () => {
  /**
   * **Feature: library-test-coverage, Property 20: Catch interception surface**
   *
   * For ANY thrown error and message, `catchInjector` intercepts and yields the documented
   * error surface:
   *  - with `restApi=false` (default) it re-throws the SAME error reference, and
   *  - with `restApi=true` it resolves to a surface preserving the beforeInstance fields and
   *    carrying an `error` ApiResponse with the `UNPROCESSABLE_ENTITY` (422) status.
   * In both modes, the supplied logger context (`beforeInstance.log`) receives the error
   * exactly once at ERROR level.
   *
   * **Validates: Requirements 9.2**
   */
  test('Property 20: default rethrows; restApi yields a 422 surface; log always invoked once', async () => {
    const arbMessage: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 24 });

    await fc.assert(
      fc.asyncProperty(arbMessage, arbMessage, fc.boolean(), async (errorMessage, logMessage, restApi) => {
        const log = makeFakeLog();
        const beforeInstance = makeBeforeInstance(log);
        const error = new Error(errorMessage);

        if (restApi) {
          const surface = await catchInjector(logMessage, true)(
            error as never,
            beforeInstance as never,
          );
          const restSurface = surface as unknown as { log: FakeLog; error: { statusCode: number } };
          if (restSurface.error.statusCode !== StatusCodes.UNPROCESSABLE_ENTITY) {
            return false;
          }
          if (restSurface.log !== log) {
            return false;
          }
        } else {
          let thrown: unknown;
          try {
            await catchInjector(logMessage, false)(error as never, beforeInstance as never);
          } catch (caught) {
            thrown = caught;
          }
          if (thrown !== error) {
            return false;
          }
        }

        // Logger context received the error once at ERROR level in both modes.
        return (
          log.now.mock.calls.length === 1 &&
          log.now.mock.calls[0][0] === error &&
          (log.now.mock.calls[0][1] as { level: LoggerLevel }).level === LoggerLevel.Error
        );
      }),
      { numRuns: 100 },
    );
  });
});
