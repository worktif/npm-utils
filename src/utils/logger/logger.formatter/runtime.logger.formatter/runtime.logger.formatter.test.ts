// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { LogAttributes, UnformattedAttributes } from '@aws-lambda-powertools/logger/types';

import { RuntimeLoggerFormatter } from './runtime.logger.formatter';
import { RuntimeLogFormatterProvider } from './runtime.logger.formatter.types';

const timestamp = new Date('2026-01-02T03:04:05.678Z');

const baseAttributes = (): UnformattedAttributes => ({
  message: { event: 'created', id: 42 },
  serviceName: 'orders-api',
  method: 'handler',
  details: {
    requestId: 'req-source',
    tenant: 'worktif',
  },
  environment: 'test',
  awsRegion: 'eu-central-1',
  lambdaContext: {
    awsRequestId: 'aws-request-1',
    functionName: 'orders-handler',
    invokedFunctionArn: 'arn:aws:lambda:eu-central-1:123:function:orders-handler',
    memoryLimitInMB: '256',
    functionVersion: '$LATEST',
    coldStart: true,
  },
  xRayTraceId: 'trace-1',
  logLevel: 'info',
  timestamp,
  sampleRateValue: 0,
} as unknown as UnformattedAttributes);

const additionalAttributes = (): LogAttributes => ({
  method: 'decorated-handler',
  details: {
    requestId: 'req-added',
    action: 'create',
  },
  ignoredUndefined: undefined,
  ignoredNull: null,
  ignoredEmpty: '',
  keptZero: 0,
} as unknown as LogAttributes);

describe('RuntimeLoggerFormatter — real formatter branches', () => {
  const originalStage = process.env.STAGE;

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalStage === undefined) {
      delete process.env.STAGE;
    } else {
      process.env.STAGE = originalStage;
    }
  });

  test('sets POWERTOOLS_DEV on module load and exposes dev-stage detection', () => {
    process.env.STAGE = 'dev';

    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Aws,
    });

    expect(process.env.POWERTOOLS_DEV).toBe('true');
    expect(formatter.isDev).toBe(true);
  });

  test('reports non-dev stages through the isDev getter', () => {
    process.env.STAGE = 'prod';

    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Aws,
    });

    expect(formatter.isDev).toBe(false);
  });

  test('formats AWS structured attributes with correlation and lambda metadata', () => {
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Aws,
    });

    const logItem = formatter.formatAttributes(baseAttributes(), additionalAttributes());
    const attributes = logItem.getAttributes();

    expect(attributes).toMatchObject({
      message: JSON.stringify({ event: 'created', id: 42 }),
      service: 'orders-api',
      method: 'decorated-handler',
      details: {
        requestId: 'req-added',
        action: 'create',
      },
      environment: 'test',
      awsRegion: 'eu-central-1',
      correlationIds: {
        awsRequestId: 'aws-request-1',
        xRayTraceId: 'trace-1',
      },
      lambdaFunction: {
        name: 'orders-handler',
        arn: 'arn:aws:lambda:eu-central-1:123:function:orders-handler',
        memoryLimitInMB: '256',
        version: '$LATEST',
        coldStart: true,
      },
      logLevel: 'info',
      timestamp: timestamp.toISOString(),
      logger: {
        sampleRateValue: 0,
      },
    });
  });

  test('falls back to source method and details when additional attributes are absent', () => {
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Aws,
    });

    const logItem = formatter.formatAttributes(baseAttributes(), undefined as unknown as LogAttributes);
    const attributes = logItem.getAttributes();

    expect(attributes.method).toBe('handler');
    expect(attributes.details).toEqual({
      requestId: 'req-source',
      tenant: 'worktif',
    });
  });

  test('emits compact console output and returns a silent log item', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.CompactConsole,
      consoleOptions: {
        colorize: false,
        maxValueLength: 200,
      },
    });

    const logItem = formatter.formatAttributes(
      {
        ...baseAttributes(),
        message: '"compact message"',
      },
      additionalAttributes(),
    );

    expect(logItem.getAttributes()).toEqual({});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/\d{2}:04:05\.678 \| INFO orders-api \| compact message/);
    expect(logSpy.mock.calls[0][0]).toContain('"tenant":"worktif"');
    expect(logSpy.mock.calls[0][0]).toContain('"action":"create"');
    expect(logSpy.mock.calls[0][0]).toContain('"keptZero":0');
    expect(logSpy.mock.calls[0][0]).not.toContain('ignoredUndefined');
    expect(logSpy.mock.calls[0][0]).not.toContain('ignoredNull');
    expect(logSpy.mock.calls[0][0]).not.toContain('ignoredEmpty');
  });

  test('emits compact console output without metadata when no details are present', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.CompactConsole,
      consoleOptions: {
        colorize: false,
      },
    });

    const logItem = formatter.formatAttributes(
      ({
        ...(baseAttributes() as any),
        details: undefined,
        message: '"bad\\x"',
      } as unknown as UnformattedAttributes),
      undefined as unknown as LogAttributes,
    );

    expect(logItem.getAttributes()).toEqual({});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/\d{2}:04:05\.678 \| INFO orders-api \| "bad\\x"/);
    expect(logSpy.mock.calls[0][0]).not.toContain('{');
  });

  test('emits rich console output with formatted metadata lines', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.RichConsole,
      consoleOptions: {
        colorize: false,
        maxMetadataDepth: 5,
      },
    });

    const logItem = formatter.formatAttributes(
      {
        ...baseAttributes(),
        message: '"rich message"',
      },
      additionalAttributes(),
    );

    const logged = logSpy.mock.calls.map(([message]) => String(message));

    expect(logItem.getAttributes()).toEqual({});
    expect(logged[0]).toMatch(/^── INFO \d{2}:04:05\.678 \| orders-api$/);
    expect(logged[1]).toBe('Message: rich message');
    expect(logged).toContain('Meta:');
    expect(logged.some(line => line.includes('tenant: worktif'))).toBe(true);
    expect(logged.some(line => line.includes('action: create'))).toBe(true);
  });

  test('emits rich console output without metadata block when no metadata is present', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.RichConsole,
      consoleOptions: {
        colorize: false,
      },
    });

    const logItem = formatter.formatAttributes(
      ({
        ...(baseAttributes() as any),
        details: undefined,
        message: 'plain rich message',
      } as unknown as UnformattedAttributes),
      undefined as unknown as LogAttributes,
    );

    const logged = logSpy.mock.calls.map(([message]) => String(message));

    expect(logItem.getAttributes()).toEqual({});
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatch(/^── INFO \d{2}:04:05\.678 \| orders-api$/);
    expect(logged[1]).toBe('Message: plain rich message');
    expect(logged).not.toContain('Meta:');
  });

  test('emits local full output by default', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Local,
      isShortened: false,
    });

    const logItem = formatter.formatAttributes(baseAttributes(), additionalAttributes());

    expect(logItem.getAttributes()).toEqual({});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(timestamp.toISOString());
    expect(logSpy.mock.calls[0][1]).toMatchObject({
      message: JSON.stringify({ event: 'created', id: 42 }),
      service: 'orders-api',
      method: 'decorated-handler',
      correlationIds: undefined,
      lambdaFunction: undefined,
    });
  });

  test('emits local shortened output with details diagnostics', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Local,
      isShortened: true,
    });

    const logItem = formatter.formatAttributes(baseAttributes(), additionalAttributes());

    expect(logItem.getAttributes()).toEqual({});
    expect(logSpy.mock.calls[0]).toEqual([
      timestamp.toISOString(),
      JSON.stringify({ event: 'created', id: 42 }),
    ]);
    expect(logSpy.mock.calls[1]).toEqual(['Details: ', baseAttributes().details]);
    expect(logSpy.mock.calls[2]).toEqual([
      'Details, stringify: ',
      JSON.stringify(baseAttributes().details),
    ]);
  });

  test('falls back to String(details) when local shortened details cannot be stringified', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Local,
      isShortened: true,
    });
    const circularDetails: Record<string, unknown> = { requestId: 'circular-details' };
    circularDetails.self = circularDetails;

    const logItem = formatter.formatAttributes(
      ({
        ...(baseAttributes() as any),
        details: circularDetails,
      } as unknown as UnformattedAttributes),
      additionalAttributes(),
    );

    expect(logItem.getAttributes()).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to stringify details'));
    expect(logSpy.mock.calls[2]).toEqual(['Details, stringify: ', '[object Object]']);
  });

  test('uses default AWS provider and console options when optional config is omitted at runtime', () => {
    const formatter = new RuntimeLoggerFormatter({} as any);

    const attributes = formatter.formatAttributes(baseAttributes(), additionalAttributes()).getAttributes();

    expect(attributes.service).toBe('orders-api');
    expect(attributes.correlationIds).toEqual({
      awsRequestId: 'aws-request-1',
      xRayTraceId: 'trace-1',
    });
  });

  test('uses custom provider fallback output for unsupported custom formatting', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Custom,
    });

    const logItem = formatter.formatAttributes(baseAttributes(), additionalAttributes());

    expect(logItem.getAttributes()).toEqual({});
    expect(logSpy).toHaveBeenCalledWith(
      'attributes: ',
      expect.objectContaining({
        message: JSON.stringify({ event: 'created', id: 42 }),
        service: 'orders-api',
        correlationIds: undefined,
        lambdaFunction: undefined,
      }),
    );
  });

  test('validates invalid provider and invalid console numeric options with AWS fallback', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const formatter = new RuntimeLoggerFormatter({
      logsProvider: 'not-a-provider' as RuntimeLogFormatterProvider,
      consoleOptions: {
        maxMetadataDepth: 0,
        maxValueLength: 1.5,
      },
    });

    const attributes = formatter.formatAttributes(baseAttributes(), additionalAttributes()).getAttributes();

    expect(attributes.service).toBe('orders-api');
    expect(attributes.correlationIds).toEqual({
      awsRequestId: 'aws-request-1',
      xRayTraceId: 'trace-1',
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid logsProvider'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid maxMetadataDepth'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid maxValueLength'));
  });

  test('falls back to String(message) when message cannot be JSON stringified', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const formatter = new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.Aws,
    });

    const circularMessage: Record<string, unknown> = { event: 'circular' };
    circularMessage.self = circularMessage;

    const attributes = formatter.formatAttributes(
      ({
        ...(baseAttributes() as any),
        message: circularMessage,
      } as unknown as UnformattedAttributes),
      additionalAttributes(),
    ).getAttributes();

    expect(attributes.message).toBe('[object Object]');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to stringify message'));
  });

  test('filters the expected empty AWS logger payload once and preserves subsequent console output', () => {
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
    const underlyingLog = jest.fn();
    console.log = underlyingLog;

    try {
      jest.isolateModules(() => {
        const isolatedFormatter = require('./runtime.logger.formatter') as typeof import('./runtime.logger.formatter');

        isolatedFormatter._setExpectEmptyJson();

        console.log('{}');
        console.log('{}');
      });

      expect(underlyingLog).toHaveBeenCalledTimes(1);
      expect(underlyingLog).toHaveBeenCalledWith('{}');
    } finally {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    }
  });
});
