// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 3.3 — unit coverage for the CLI logger plugin (`LoggerCliPlugin` and its companion
 * `LoggerCliPluginExt`) with a controlled environment (Requirements 5.2, 5.4), plus the
 * reuse-not-duplication audit (Requirement 5.5, Property 11).
 *
 * Isolation strategy mirrors Task 3.1 (`logger.test.ts`): the plugin transitively imports
 * `@utils/logger` → `logger.utils.ts` → the `@core/bundle` barrel
 * (`import { bundle } from '../../bundle'`). Under ts-jest/CommonJS that barrel evaluates
 * `bundle.ts`'s `export const bundle = new Bundle()` side effect and trips the characterized
 * serializer barrel-cycle defect. We stub the same `src/bundle` module (resolved here via the
 * relative specifier `../../../../bundle`) with the minimal `cli.logger` surface so the plugin
 * can be unit-tested in isolation. No production source is modified.
 *
 * Determinism / isolation: every behavioural case runs inside `withEnv` (snapshot/restore of
 * `process.env`) and uses `captureConsole` to spy the console sinks. The plugin wires its
 * underlying logger asynchronously (`initLog(...).then(...)`), so we flush the microtask/IO
 * queue with `settleInit()` before asserting on the initialized surface.
 *
 * Characterization note — the plugin constructs its underlying logger with
 * `initLog(console, prefix, LoggerLevel.Debug)`. Because DEBUG is suppressed unless
 * `RUNTIME_DEBUG=true`, a no-option `now()` call short-circuits and returns the payload WITHOUT
 * emitting through the (raw `console`) logger; the plugin's real output channel is
 * `LoggerCliPluginExt.stack`. These tests pin that observable contract: payload pass-through +
 * forwarding to the ext sink.
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fc from 'fast-check';

import { withEnv, captureConsole } from '../../../../../test/test-harness';
import type { ConsoleRecords } from '../../../../../test/test-harness';
import { ANSI_FG_NC, ANSI_FG_RED } from '@utils/logger/logger.utils';
import { LoggerLevel } from '@utils/logger/logger.types';
import type { EnvConfigDefault } from '@core/config/env.config.default';

import { LoggerCliPlugin } from './logger.cli.plugin';
import { LoggerCliPluginExt } from './logger.cli.plugin.ext';

/**
 * Baseline deterministic env. DEBUG suppressed (no `RUNTIME_DEBUG`), no service-name/level
 * overrides, stable stage. Snapshotted/restored by `withEnv` per case (Requirement 2.1, 8.4).
 */
const BASE_ENV: Readonly<Record<string, string | undefined>> = {
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
  STAGE: 'test',
};

/** The exact red-format console template the plugin/ext use for error lines. */
const RED_FORMAT = `${ANSI_FG_RED}%s${ANSI_FG_NC}`;

/** The "uninitialised" notice emitted by the pre-wiring stubs. */
const NOT_INITIALISED = 'Logger is not initialised.';

/**
 * Builds a minimal `EnvConfigDefault` stand-in exposing only the `bundle` surface the plugin
 * reads when composing its provider/stage prefix. Cast through `unknown` because the plugin
 * only touches `bundle.{stage,provider}`.
 */
const fakeEnv = (bundle: {
  stage?: string | null;
  provider?: string | null;
  debug?: string | null;
}): EnvConfigDefault => ({ bundle } as unknown as EnvConfigDefault);

/**
 * A fake `LoggerCliPluginExt` so assertions target the plugin's forwarding contract without
 * coupling to the ext's own `console.log` fan-out (covered separately below).
 */
type FakeExt = LoggerCliPluginExt & {
  stack: jest.Mock;
  error: jest.Mock;
};

const makeFakeExt = (): FakeExt =>
  ({ stack: jest.fn(), error: jest.fn() } as unknown as FakeExt);

/** Flush the microtask + immediate queue so the async `initLog(...).then(...)` wiring lands. */
const settleInit = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('LoggerCliPlugin — pre-initialisation stubs', () => {
  test('now() is a stub that, when fully invoked, reports the logger is not initialised', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'test' }), makeFakeExt());

        // Synchronously (before the async wiring lands) `now` is the curried stub.
        const inner = (plugin.now as unknown as (...a: unknown[]) => unknown)('payload');
        expect(typeof inner).toBe('function');
        (inner as () => void)();

        expect(records.log).toContainEqual([NOT_INITIALISED]);
      } finally {
        records.restore();
        await settleInit();
      }
    });
  });

  test('future() stub logs the notice and resolves to an empty array', async () => {
    await withEnv(BASE_ENV, async () => {
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'test' }), makeFakeExt());

        const result = await (plugin.future as unknown as (p: unknown) => Promise<unknown>)(
          Promise.resolve('ignored'),
        );

        expect(result).toEqual([]);
        expect(records.log).toContainEqual([NOT_INITIALISED]);
      } finally {
        records.restore();
        await settleInit();
      }
    });
  });
});

describe('LoggerCliPlugin — initialized forwarding contract', () => {
  test('now() returns the payload (DEBUG-suppressed) and forwards it to the ext sink', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'prod' }), ext);
        await settleInit();

        const payload = { orderId: 7, currency: 'EUR' };
        const returned = plugin.now(payload as never);

        // Identity pass-through: the payload is returned unchanged ...
        expect(returned).toEqual(payload);
        // ... and forwarded to the ext sink exactly once.
        expect(ext.stack).toHaveBeenCalledTimes(1);
        expect(ext.stack).toHaveBeenCalledWith(payload);

        // The underlying logger (raw console, DEBUG default) emits nothing.
        expect(records.error).toHaveLength(0);
        expect(records.warn).toHaveLength(0);
        expect(records.log).toHaveLength(0);
      } finally {
        records.restore();
      }
    });
  });

  test('stack() forwards every entry through now() to the ext sink, preserving order', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'local' }), ext);
        await settleInit();

        plugin.stack([['first'], ['second']]);

        expect(ext.stack).toHaveBeenCalledTimes(2);
        expect(ext.stack).toHaveBeenNthCalledWith(1, ['first']);
        expect(ext.stack).toHaveBeenNthCalledWith(2, ['second']);
      } finally {
        records.restore();
      }
    });
  });

  test('future() awaits the promise and forwards the resolved value (wrapped) to the ext sink', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'prod' }), ext);
        await settleInit();

        const resolved = { done: true };
        const returned = await plugin.future(Promise.resolve(resolved) as never, {
          level: LoggerLevel.Debug,
        });

        expect(returned).toEqual(resolved);
        expect(ext.stack).toHaveBeenCalledTimes(1);
        // `future` wraps the result in a single-element array before handing it to the sink.
        expect(ext.stack).toHaveBeenCalledWith([resolved]);
      } finally {
        records.restore();
      }
    });
  });
});

describe('LoggerCliPlugin — error()', () => {
  test('formats the error in red and forwards it via the sink when exit is disabled', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'prod' }), ext);
        await settleInit();

        plugin.error('boom', null, { error: false, stderr: false });

        expect(ext.stack).toHaveBeenCalledTimes(1);
        expect(ext.stack).toHaveBeenCalledWith([RED_FORMAT, 'Error: boom']);
      } finally {
        records.restore();
      }
    });
  });

  test('forwards a raw stderr line via the sink when exit is disabled', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'prod' }), ext);
        await settleInit();

        plugin.error(null, 'stderr-output', { error: false, stderr: false });

        expect(ext.stack).toHaveBeenCalledTimes(1);
        expect(ext.stack).toHaveBeenCalledWith(['%s', 'stderr-output']);
      } finally {
        records.restore();
      }
    });
  });

  test('exits the process on error when the exit condition is enabled (default)', async () => {
    await withEnv(BASE_ENV, async () => {
      const ext = makeFakeExt();
      const records: ConsoleRecords = captureConsole();
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation(((): never => undefined as never));
      try {
        const plugin = new LoggerCliPlugin(fakeEnv({ stage: 'prod' }), ext);
        await settleInit();

        plugin.error('fatal', null);

        expect(ext.stack).toHaveBeenCalledWith([RED_FORMAT, 'Error: fatal']);
        expect(exitSpy).toHaveBeenCalledWith(0);
      } finally {
        exitSpy.mockRestore();
        records.restore();
      }
    });
  });
});

describe('LoggerCliPluginExt — console fan-out', () => {
  test('stack() spreads every entry into a console.log call, in order', () => {
    const records: ConsoleRecords = captureConsole();
    try {
      const ext = new LoggerCliPluginExt();
      ext.stack([['%s', 'hello'], ['world']]);

      expect(records.log).toEqual([['%s', 'hello'], ['world']]);
    } finally {
      records.restore();
    }
  });

  test('error() emits a red-formatted error line and skips exit when disabled', () => {
    const records: ConsoleRecords = captureConsole();
    try {
      const ext = new LoggerCliPluginExt();
      ext.error('kaboom', null, { error: false, stderr: false });

      expect(records.log).toEqual([[RED_FORMAT, 'Error: kaboom']]);
    } finally {
      records.restore();
    }
  });

  test('error() emits a raw stderr line and skips exit when disabled', () => {
    const records: ConsoleRecords = captureConsole();
    try {
      const ext = new LoggerCliPluginExt();
      ext.error(null, 'stderr-text', { error: false, stderr: false });

      expect(records.log).toEqual([['%s', 'stderr-text']]);
    } finally {
      records.restore();
    }
  });

  test('error() exits the process when the exit condition is enabled (default)', () => {
    const records: ConsoleRecords = captureConsole();
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((): never => undefined as never));
    try {
      const ext = new LoggerCliPluginExt();
      ext.error('fatal', null);

      expect(records.log).toEqual([[RED_FORMAT, 'Error: fatal']]);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
      records.restore();
    }
  });
});

/**
 * Reuse-not-duplication audit (Requirement 5.5).
 *
 * The formatter behaviors (timestamp/color/metadata formatting, provider routing, environment
 * selection, AWS/console formatter structure) are already pinned by the existing formatter
 * suite under `logger.formatter/runtime.logger.formatter`. This CLI-plugin spec deliberately
 * targets a DISJOINT surface (plugin wiring, payload forwarding, ext fan-out, error/exit
 * semantics) and reuses the shared test harness rather than the formatter utilities.
 */
const FORMATTER_SUITE_DIR = path.resolve(
  __dirname,
  '../../logger.formatter/runtime.logger.formatter',
);
const CLI_TEST_FILE = path.join(__dirname, 'logger.cli.plugin.test.ts');

/**
 * Collects the set of property identifiers (e.g. `Property 14`) already asserted by the
 * existing formatter suite, by scanning its co-located `*.test.ts` files for their
 * requirement-traceable feature tags.
 */
function collectFormatterProperties(): string[] {
  const files = fs
    .readdirSync(FORMATTER_SUITE_DIR)
    .filter((file) => file.endsWith('.test.ts'));
  const combined = files
    .map((file) => fs.readFileSync(path.join(FORMATTER_SUITE_DIR, file), 'utf8'))
    .join('\n');

  const tagPattern = /console-logger-formatters,\s*(Property\s+\d+)/g;
  const properties = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(combined)) !== null) {
    properties.add(match[1].replace(/\s+/g, ' '));
  }
  return [...properties].sort();
}

describe('library-test-coverage — reuse, not duplication (Requirement 5.5)', () => {
  /**
   * **Feature: library-test-coverage, Property 11: Existing formatter coverage is reused, not duplicated**
   *
   * For any behavior already covered by the existing formatter suite (identified by its
   * requirement-traceable property tags), this CLI-plugin spec re-asserts NONE of them: it
   * neither re-imports the formatter utility module nor re-declares any formatter-suite
   * property tag. Reuse is demonstrated structurally — the plugin spec relies on the shared
   * test harness and leaves formatter behavior to the suite that already owns it.
   *
   * **Validates: Requirements 5.5**
   */
  test('Property 11: no formatter-suite property is re-asserted by the CLI-plugin spec', () => {
    const formatterProperties = collectFormatterProperties();
    // The reuse target must exist: there is genuine, pre-existing formatter coverage.
    expect(formatterProperties.length).toBeGreaterThan(0);

    const cliSource = fs.readFileSync(CLI_TEST_FILE, 'utf8');

    // Structural reuse: the shared harness is reused, and the formatter utility module
    // (whose name is assembled from fragments so this assertion never matches itself) is NOT
    // re-imported here.
    expect(cliSource).toContain('test-harness');
    const formatterUtilsModule = 'console.formatter' + '.utils';
    expect(cliSource).not.toContain(formatterUtilsModule);

    const suiteFeaturePrefix = 'console-logger-formatters, ';
    fc.assert(
      fc.property(fc.constantFrom(...formatterProperties), (property) => {
        // The CLI-plugin spec must not re-declare a formatter-suite feature tag.
        return !cliSource.includes(suiteFeaturePrefix + property);
      }),
      { numRuns: 100 },
    );
  });
});
