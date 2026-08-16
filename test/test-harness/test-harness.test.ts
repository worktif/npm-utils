// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { captureConsole, isolatedImport, withEnv } from './index';

describe('withEnv', () => {
  const SENTINEL = '__WORKTIF_HARNESS_SENTINEL__';

  afterEach(() => {
    delete process.env[SENTINEL];
  });

  test('applies string overrides for the duration of the callback', async () => {
    expect(process.env[SENTINEL]).toBeUndefined();

    const seen = await withEnv({ [SENTINEL]: 'on' }, () => process.env[SENTINEL]);

    expect(seen).toBe('on');
    expect(process.env[SENTINEL]).toBeUndefined();
  });

  test('restores the original value of a pre-existing variable', async () => {
    process.env[SENTINEL] = 'original';

    const seen = await withEnv({ [SENTINEL]: 'override' }, () => process.env[SENTINEL]);

    expect(seen).toBe('override');
    expect(process.env[SENTINEL]).toBe('original');
  });

  test('treats an undefined override as an explicit unset', async () => {
    process.env[SENTINEL] = 'original';

    const seen = await withEnv({ [SENTINEL]: undefined }, () => process.env[SENTINEL]);

    expect(seen).toBeUndefined();
    expect(process.env[SENTINEL]).toBe('original');
  });

  test('restores the environment even when the callback throws', async () => {
    process.env[SENTINEL] = 'original';

    await expect(
      withEnv({ [SENTINEL]: 'override' }, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(process.env[SENTINEL]).toBe('original');
  });

  test('removes keys added by the callback and reinstates keys it deleted', async () => {
    process.env[SENTINEL] = 'original';
    const ADDED = `${SENTINEL}_ADDED`;

    await withEnv({}, () => {
      process.env[ADDED] = 'leaked';
      delete process.env[SENTINEL];
    });

    expect(process.env[ADDED]).toBeUndefined();
    expect(process.env[SENTINEL]).toBe('original');
  });

  test('awaits async callbacks and returns their resolved value', async () => {
    const value = await withEnv({ [SENTINEL]: 'async' }, async () => {
      await Promise.resolve();
      return process.env[SENTINEL];
    });

    expect(value).toBe('async');
  });
});

describe('isolatedImport', () => {
  test('returns the value produced by the loader', () => {
    const value = isolatedImport(() => ({ token: 'isolated' }));

    expect(value).toEqual({ token: 'isolated' });
  });

  test('runs each load against a fresh module registry', () => {
    const first = isolatedImport(
      () => require('./fixtures/load-counter') as typeof import('./fixtures/load-counter'),
    );
    const second = isolatedImport(
      () => require('./fixtures/load-counter') as typeof import('./fixtures/load-counter'),
    );

    // The fixture re-runs its top-level code on every isolated import (fresh module
    // registry), so its global load counter strictly increases and the two module
    // objects are distinct references — proving module-load side effects do not leak.
    expect(second.loadId).toBe(first.loadId + 1);
    expect(first).not.toBe(second);
  });
});

describe('captureConsole', () => {
  test('records log/warn/error calls without emitting and restores originals', () => {
    const originalLog = console.log;
    const consoleRecords = captureConsole();

    try {
      console.log('a', 1);
      console.warn('b');
      console.error('c', { k: 'v' });

      expect(consoleRecords.log).toEqual([['a', 1]]);
      expect(consoleRecords.warn).toEqual([['b']]);
      expect(consoleRecords.error).toEqual([['c', { k: 'v' }]]);
    } finally {
      consoleRecords.restore();
    }

    expect(console.log).toBe(originalLog);
  });

  test('restore is idempotent', () => {
    const consoleRecords = captureConsole();

    expect(() => {
      consoleRecords.restore();
      consoleRecords.restore();
    }).not.toThrow();
  });
});
