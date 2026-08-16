// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Recorded console output captured by {@link captureConsole}.
 *
 * Each field is an ordered list of the argument arrays passed to the corresponding
 * console sink, preserving call order and multi-argument calls verbatim so tests can
 * assert on stable observable fields.
 */
export interface ConsoleRecords {
  /** Argument arrays for every intercepted `console.log` call, in order. */
  readonly log: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Argument arrays for every intercepted `console.warn` call, in order. */
  readonly warn: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Argument arrays for every intercepted `console.error` call, in order. */
  readonly error: ReadonlyArray<ReadonlyArray<unknown>>;
  /**
   * Detaches all spies and restores the original console methods. Idempotent: calling
   * it more than once is safe. Callers should invoke this in a `finally`/`afterEach`
   * to avoid leaking spies across tests.
   */
  restore(): void;
}

/**
 * Spies the `log`, `warn`, and `error` console sinks — the sinks the library's
 * runtime logger, formatters, and decorator error paths write to — and records every
 * call without emitting to the real terminal.
 *
 * The returned {@link ConsoleRecords} exposes the captured argument arrays and a
 * `restore()` that reinstates the originals. Capture starts immediately on call.
 *
 * @returns A live {@link ConsoleRecords} handle; arrays are mutated as calls arrive.
 *
 * @example
 * ```ts
 * const consoleRecords = captureConsole();
 * try {
 *   logger().info('hello');
 *   await Promise.resolve(); // flush async logger init before asserting
 *   expect(consoleRecords.log.length).toBeGreaterThan(0);
 * } finally {
 *   consoleRecords.restore();
 * }
 * ```
 */
export function captureConsole(): ConsoleRecords {
  const log: unknown[][] = [];
  const warn: unknown[][] = [];
  const error: unknown[][] = [];

  const logSpy = jest
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]): void => {
      log.push(args);
    });
  const warnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation((...args: unknown[]): void => {
      warn.push(args);
    });
  const errorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]): void => {
      error.push(args);
    });

  return {
    log,
    warn,
    error,
    restore(): void {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}
