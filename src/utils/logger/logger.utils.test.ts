// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * `logger.utils.ts` imports the `@core/bundle` barrel (`import { bundle } from '../../bundle'`)
 * purely to reach `bundle.cli.logger` from its CLI helpers (`execAction`, `stop`). Importing
 * that barrel under ts-jest/CommonJS would (a) evaluate `bundle.ts`'s `export const bundle =
 * new Bundle()` module-load side effect and (b) trip the characterized serializer barrel-cycle
 * defect (`Class extends value undefined`, pinned in `bundle.barrel-cycle.known-bug.test.ts`).
 *
 * To unit-test these utilities in isolation we substitute the `../../bundle` module with a
 * minimal stub exposing only the `cli.logger.error` / `cli.logger.stack` surface the helpers
 * touch. No production source is modified. The mock path `../../bundle` resolves to exactly the
 * same module (`src/bundle`) that `logger.utils.ts` imports, so the stub is what the unit sees.
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

/**
 * `writeLog` performs real filesystem effects (`existsSync`/`mkdirSync`/`writeFileSync`).
 * The `node:fs` builtin exposes non-configurable methods that cannot be re-spied via
 * `jest.spyOn`, so we substitute the whole module with jest fns. This keeps `writeLog`
 * deterministic and writes nothing to disk (no temp files to clean up).
 */
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'node:fs';

import { bundle } from '../../bundle';
import { LoggerLevel } from './logger.types';
import {
  ANSI_FG_GREEN,
  ANSI_FG_NC,
  ANSI_FG_RED,
  ANSI_FG_YELLOW,
  DEFAULT_LOG_LEVEL,
  EMPTY_LINE,
  LOGGER_INFO_OPTION_NAME,
  defineLogType,
  execAction,
  stop,
  writeLog,
} from './logger.utils';

/** Convenience handle to the stubbed CLI logger installed by the `jest.mock` above. */
const cliLogger = bundle.cli.logger as unknown as {
  error: jest.Mock;
  stack: jest.Mock;
};

beforeEach(() => {
  cliLogger.error.mockClear();
  cliLogger.stack.mockClear();
});

describe('logger.utils — constants', () => {
  test('exposes the documented ANSI/format constants verbatim', () => {
    expect(EMPTY_LINE).toBe('\n');
    expect(ANSI_FG_RED).toBe('\x1b[31m');
    expect(ANSI_FG_YELLOW).toBe('\x1b[33m');
    expect(ANSI_FG_GREEN).toBe('\x1b[32m');
    expect(ANSI_FG_NC).toBe('\x1b[0m');
  });

  test('the info option name and default log level are stable', () => {
    expect(LOGGER_INFO_OPTION_NAME).toBe('details');
    expect(DEFAULT_LOG_LEVEL).toBe(LoggerLevel.Info);
  });
});

describe('logger.utils — defineLogType (level handling)', () => {
  test('maps every LoggerLevel to its powertools log-method name', () => {
    expect(defineLogType(LoggerLevel.Debug)).toBe('debug');
    expect(defineLogType(LoggerLevel.Info)).toBe('info');
    expect(defineLogType(LoggerLevel.Error)).toBe('error');
    expect(defineLogType(LoggerLevel.Warn)).toBe('warn');
    expect(defineLogType(LoggerLevel.Critical)).toBe('critical');
    // `silent` has no powertools sink, so it intentionally maps to `debug`.
    expect(defineLogType(LoggerLevel.Silent)).toBe('debug');
  });

  test('falls back to the default level for an unrecognized level', () => {
    expect(defineLogType('totally-unknown' as LoggerLevel)).toBe(DEFAULT_LOG_LEVEL);
  });

  test('honors an explicit default level override on miss', () => {
    expect(defineLogType('totally-unknown' as LoggerLevel, 'warn')).toBe('warn');
  });
});

describe('logger.utils — execAction', () => {
  test('reorders the node exec callback args to (response, stderr, error) and forwards to the CLI logger', () => {
    const callback = jest.fn();
    const handler = execAction(callback);

    const error = new Error('exec-failed');
    handler(error, 'the-response', 'the-stderr');

    // CLI logger receives (error, stderr, exitConditions) with the default exit conditions.
    expect(cliLogger.error).toHaveBeenCalledTimes(1);
    expect(cliLogger.error).toHaveBeenCalledWith(error, 'the-stderr', {
      error: true,
      stderr: true,
    });

    // The wrapped callback receives the reordered (response, stderr, error) tuple.
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('the-response', 'the-stderr', error);
  });

  test('passes through custom exit conditions', () => {
    const callback = jest.fn();
    const exitConditions = { error: false, stderr: true };
    const handler = execAction(callback, exitConditions);

    handler(null, 'resp', 'err-out');

    expect(cliLogger.error).toHaveBeenCalledWith(null, 'err-out', exitConditions);
  });
});

describe('logger.utils — stop', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    // `process.exit` is stubbed so the helper does not terminate the test runner.
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((): never => undefined as never));
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test('stacks the provided args and exits with code 0', () => {
    stop(['line-1', 'line-2']);

    expect(cliLogger.stack).toHaveBeenCalledTimes(1);
    expect(cliLogger.stack).toHaveBeenCalledWith([['line-1', 'line-2']]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('skips stacking when no args are supplied but still exits', () => {
    stop([]);

    expect(cliLogger.stack).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('logger.utils — writeLog', () => {
  const existsMock = fs.existsSync as unknown as jest.Mock;
  const mkdirMock = fs.mkdirSync as unknown as jest.Mock;
  const writeMock = fs.writeFileSync as unknown as jest.Mock;

  beforeEach(() => {
    existsMock.mockReset();
    mkdirMock.mockReset();
    writeMock.mockReset();
  });

  test('creates the .logs directory when absent and writes sanitized, JSON-serialized data', () => {
    existsMock.mockReturnValue(false);

    writeLog('order/Created action', { id: 9 });

    expect(mkdirMock).toHaveBeenCalledTimes(1);
    const [mkdirPath, mkdirOptions] = mkdirMock.mock.calls[0];
    expect(String(mkdirPath)).toMatch(/\.logs$/);
    expect(mkdirOptions).toEqual({ recursive: true });

    expect(writeMock).toHaveBeenCalledTimes(1);
    const [writePath, writeContent] = writeMock.mock.calls[0];
    // Unsafe characters in the action name are replaced with underscores for the filename.
    expect(String(writePath)).toMatch(/\.order_Created_action\.log$/);
    expect(writeContent).toBe(`${JSON.stringify({ id: 9 })}\n`);
  });

  test('does not recreate the .logs directory when it already exists', () => {
    existsMock.mockReturnValue(true);

    writeLog('plain', { ok: true });

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
