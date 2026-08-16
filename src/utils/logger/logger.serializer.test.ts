// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import identity from 'lodash/identity';

import {
  loggerSerializers,
  mapOptionsToAsyncSerializer,
  mapOptionsToSerializer,
} from './logger.serializer';
import { EntitySerializer, LoggerInstanceOptions } from './logger.types';

/**
 * Task 3.1 — unit coverage for the logger serializer mappers (Requirement 5.1: identity
 * fallbacks). These pure mappers decide whether a caller-supplied serializer is applied
 * synchronously, resolved asynchronously, or whether the library falls back to lodash
 * `identity` (the pass-through that pins the "log the payload unchanged" contract).
 *
 * No `bundle` is reached by `logger.serializer.ts`, so these run without module isolation
 * or mocking; they are deterministic by construction.
 */
describe('logger.serializer — synchronous mapper (mapOptionsToSerializer)', () => {
  test('falls back to lodash identity when no options are provided', () => {
    const mapped = mapOptionsToSerializer(undefined);

    // Identity fallback: the exact lodash `identity` reference is returned.
    expect(mapped).toBe(identity);
    expect(mapped?.(42)).toBe(42);
  });

  test('falls back to lodash identity when options carry no serializer', () => {
    const mapped = mapOptionsToSerializer({ tag: 'noop' } as LoggerInstanceOptions);

    expect(mapped).toBe(identity);
    const payload = { id: 1 };
    expect(mapped?.(payload)).toBe(payload);
  });

  test('returns the caller serializer verbatim when it is a non-thenable function', () => {
    const serializer: EntitySerializer = (value) => ({ wrapped: value });
    const mapped = mapOptionsToSerializer({ serializer } as LoggerInstanceOptions);

    expect(mapped).toBe(serializer);
    expect(mapped?.('x')).toEqual({ wrapped: 'x' });
  });

  test('returns undefined (defers to the async mapper) when the serializer is thenable', () => {
    // A thenable serializer signals the async path; the sync mapper must NOT consume it.
    const thenableSerializer = { then: (): void => undefined } as unknown as EntitySerializer;
    const mapped = mapOptionsToSerializer({ serializer: thenableSerializer } as LoggerInstanceOptions);

    expect(mapped).toBeUndefined();
  });
});

describe('logger.serializer — asynchronous mapper (mapOptionsToAsyncSerializer)', () => {
  test('falls back to lodash identity when no options are provided', async () => {
    const mapped = await mapOptionsToAsyncSerializer(undefined, console);

    expect(mapped).toBe(identity);
    expect(mapped?.('value')).toBe('value');
  });

  test('returns the caller serializer verbatim when it is a non-thenable function', async () => {
    const serializer: EntitySerializer = (value) => ({ wrapped: value });
    const mapped = await mapOptionsToAsyncSerializer(
      { serializer } as LoggerInstanceOptions,
      console,
    );

    expect(mapped).toBe(serializer);
    expect(mapped?.(7)).toEqual({ wrapped: 7 });
  });

  test('resolves a thenable serializer factory against the logger instance', async () => {
    const innerSerializer: EntitySerializer = (value) => ({ async: value });
    // Characterizes the async branch: the serializer is callable (factory) AND thenable, so
    // the mapper invokes it with the logger instance and awaits the produced serializer.
    const factory = ((loggerInstance: unknown): Promise<EntitySerializer> => {
      expect(loggerInstance).toBe(console);
      return Promise.resolve(innerSerializer);
    }) as unknown as { then: () => void } & ((l: unknown) => Promise<EntitySerializer>);
    (factory as unknown as { then: () => void }).then = (): void => undefined;

    const mapped = await mapOptionsToAsyncSerializer(
      { serializer: factory } as unknown as LoggerInstanceOptions,
      console,
    );

    expect(mapped).toBe(innerSerializer);
    expect(mapped?.('payload')).toEqual({ async: 'payload' });
  });
});

describe('logger.serializer — built-in serializers (loggerSerializers)', () => {
  // The map is typed as `EntityLoggerSerializer` (logger-instance factory), but the `axios`
  // entry is the curried lodash `get(_, 'data')` accessor; cast to its real call shape.
  const axios = loggerSerializers.axios as unknown as (response: unknown) => unknown;

  test('axios serializer extracts the `data` field from a response-like object', () => {
    expect(axios({ data: { ok: true } })).toEqual({ ok: true });
  });

  test('axios serializer yields undefined when `data` is absent', () => {
    expect(axios({ status: 200 })).toBeUndefined();
  });
});
