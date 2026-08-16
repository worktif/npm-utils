// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Smart stdout filter for AWS Logger integration.
 *
 * Problem: AWS Logger always calls console.log(JSON.stringify(logItem.getAttributes()))
 * after formatAttributes(). When we use custom console output in formatAttributes() and
 * return an empty LogItem, AWS Logger outputs "{}" which pollutes the logs.
 *
 * Solution: Use a flag-based filter that only filters "{}" immediately after our
 * formatter output. This preserves user's ability to log "{}" intentionally.
 *
 * The flag is set by formatAttributes() before returning, and reset after the next
 * console call (whether it's "{}" or not).
 */

// Flag to signal that the next "{}" should be filtered
// This is set by formatAttributes() and reset after the next console call
let _expectEmptyJsonFromAwsLogger = false;

/**
 * Sets the flag to filter the next "{}" output from AWS Logger.
 * Called internally by formatAttributes() before returning a silent LogItem.
 * @internal
 */
export function _setExpectEmptyJson(): void {
  _expectEmptyJsonFromAwsLogger = true;
}

// Auto-initialize on module load:
// 1. Set POWERTOOLS_DEV=true so AWS Logger uses global console (not new Console())
// 2. Patch console methods with smart filter
(() => {
  if (typeof process !== 'undefined' && process.env) {
    process.env.POWERTOOLS_DEV = 'true';
  }

  if (typeof console !== 'undefined') {
    const patchMethod = (method: 'log' | 'info' | 'warn' | 'error' | 'debug') => {
      const original = console[method];
      (console as any)[method] = (...args: any[]) => {
        // Check if this is the "{}" we're expecting from AWS Logger
        if (_expectEmptyJsonFromAwsLogger && args.length === 1 && args[0] === '{}') {
          _expectEmptyJsonFromAwsLogger = false;
          return; // Filter this "{}"
        }
        // Reset flag after any console call
        _expectEmptyJsonFromAwsLogger = false;

        return original.apply(console, args);
      };
    };

    // Patch all methods that AWS Logger might use based on log level
    patchMethod('log');
    patchMethod('info');
    patchMethod('warn');
    patchMethod('error');
    patchMethod('debug');
  }
})();

import { LoggerLogsFormatter } from '@utils/logger/logger.formatter/logger.logs.formatter';
import {
  ConsoleFormatterOptions,
  RuntimeLogFormatterOptions,
  RuntimeLogFormatterProvider,
} from '@utils/logger/logger.formatter/runtime.logger.formatter/runtime.logger.formatter.types';
import { LogAttributes, UnformattedAttributes } from '@aws-lambda-powertools/logger/types';
import { LogItem } from '@aws-lambda-powertools/logger';
import { injectable } from 'inversify';
import {
  colorize,
  detectTTY,
  formatCompactMetadata,
  formatRichMetadata,
  formatShortTimestamp,
  processMessageForConsole,
} from '@utils/logger/logger.formatter/runtime.logger.formatter/console.formatter.utils';

/**
 * The `RuntimeLogFormatter` class extends `LogFormatter` to provide custom formatting
 * of log data with additional application-specific attributes. It is designed to handle
 * structured logging and integrates with multiple deployment environments, particularly
 * useful for cloud-based applications.
 */
@injectable()
export class RuntimeLoggerFormatter extends LoggerLogsFormatter {

  /**
   * The deployment stage of the application.
   * Represents the current environment in which the application is running.
   * Defaults to 'dev' if the environment variable `STAGE` is not set.
   */
  private stage: string = process.env.STAGE ?? 'dev';

  /**
   * Determines if the current stage is a development or own stage.
   *
   * @return {boolean} Returns true if the current stage is undefined, 'dev', or 'own'; otherwise, false.
   */
  get isDev(): boolean {
    return !this.stage || ['dev'].includes(this.stage);
  }

  /**
   * The `logsProvider` variable is an instance of the `RuntimeLogFormatterProvider`.
   * It is used as a provider for log formatting functionality within the application.
   * This provider is responsible for managing and applying specific formatting rules
   * to log messages, ensuring they adhere to defined styles or standards.
   */
  private logsProvider: RuntimeLogFormatterProvider;

  /**
   * A boolean flag that indicates whether the content has been shortened.
   *
   * When set to `true`, it signifies that the content displayed is a truncated or abbreviated version.
   * When set to `false`, the content is displayed in its full, unaltered form.
   */
  private isShortened: boolean = false;

  /**
   * Configuration options for console formatters (CompactConsole and RichConsole).
   * Includes settings for colorization, metadata depth, value truncation, and timestamp format.
   */
  private consoleOptions: ConsoleFormatterOptions;

  /**
   * Cached TTY detection result to avoid repeated checks.
   * Determines if ANSI color codes should be applied to console output.
   */
  private isTTY: boolean;

  constructor(options: RuntimeLogFormatterOptions) {
    super();

    // Validate and set logsProvider with fallback
    if (options.logsProvider && !Object.values(RuntimeLogFormatterProvider).includes(options.logsProvider)) {
      console.warn(`[RuntimeLoggerFormatter] Invalid logsProvider "${options.logsProvider}". Falling back to AWS formatter.`);
      this.logsProvider = RuntimeLogFormatterProvider.Aws;
    } else {
      this.logsProvider = options.logsProvider ?? RuntimeLogFormatterProvider.Aws;
    }

    this.isShortened = options.isShortened ?? false;

    // Validate and initialize console options with defaults
    const maxMetadataDepth = this.validatePositiveInteger(
      options.consoleOptions?.maxMetadataDepth,
      3,
      'maxMetadataDepth',
    );
    const maxValueLength = this.validatePositiveInteger(
      options.consoleOptions?.maxValueLength,
      1000,
      'maxValueLength',
    );

    this.consoleOptions = {
      maxMetadataDepth,
      maxValueLength,
      timestampFormat: options.consoleOptions?.timestampFormat ?? 'short',
      colorize: options.consoleOptions?.colorize,
    };

    // Cache TTY detection result
    this.isTTY = this.consoleOptions.colorize ?? detectTTY();
  }

  /**
   * Validates that a numeric option is a positive integer.
   * Logs a warning to stderr and returns the default value if validation fails.
   */
  private validatePositiveInteger(value: number | undefined, defaultValue: number, optionName: string): number {
    if (value === undefined) {
      return defaultValue;
    }

    if (!Number.isInteger(value) || value <= 0) {
      console.warn(`[RuntimeLoggerFormatter] Invalid ${optionName}: ${value}. Must be a positive integer. Using default: ${defaultValue}`);
      return defaultValue;
    }

    return value;
  }

  /**
   * Creates an empty LogItem and signals the filter to skip the next "{}".
   * @returns {LogItem} An empty LogItem
   */
  private createSilentLogItem(): LogItem {
    // Signal that the next "{}" from AWS Logger should be filtered
    _setExpectEmptyJson();
    return new LogItem({ attributes: {} });
  }

  /**
   * Formats log and contextual attributes into a structured log item.
   */
  public formatAttributes(
    attributes: UnformattedAttributes,
    additionalLogAttributes: LogAttributes,
  ): LogItem {
    // Safely stringify message with fallback
    let messageStr: string;
    try {
      messageStr = JSON.stringify(attributes.message);
    } catch (error) {
      console.warn(`[RuntimeLoggerFormatter] Failed to stringify message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      messageStr = String(attributes.message);
    }

    const baseAttributes = {
      message: messageStr,
      service: attributes.serviceName,
      method: additionalLogAttributes ? additionalLogAttributes.method : attributes.method,
      details: additionalLogAttributes ? additionalLogAttributes.details : attributes.details,
      environment: attributes.environment,
      awsRegion: attributes.awsRegion,
      correlationIds: this.logsProvider === RuntimeLogFormatterProvider.Aws
        ? {
          awsRequestId: attributes.lambdaContext?.awsRequestId,
          xRayTraceId: attributes.xRayTraceId,
        }
        : void 0,
      lambdaFunction: this.logsProvider === RuntimeLogFormatterProvider.Aws
        ? {
          name: attributes.lambdaContext?.functionName,
          arn: attributes.lambdaContext?.invokedFunctionArn,
          memoryLimitInMB: attributes.lambdaContext?.memoryLimitInMB,
          version: attributes.lambdaContext?.functionVersion,
          coldStart: attributes.lambdaContext?.coldStart,
        }
        : void 0,
      logLevel: attributes.logLevel,
      timestamp: this.formatTimestamp(attributes.timestamp),
      logger: {
        sampleRateValue: attributes.sampleRateValue,
      },
    };

    if (this.logsProvider === RuntimeLogFormatterProvider.Aws) {
      const logItem = new LogItem({ attributes: baseAttributes });
      logItem.addAttributes(additionalLogAttributes);
      return logItem;
    } else if (this.logsProvider === RuntimeLogFormatterProvider.CompactConsole) {
      // Format: [timestamp] LEVEL [context] message {metadata}
      const timestampStr = attributes.timestamp instanceof Date
        ? attributes.timestamp.toISOString()
        : String(attributes.timestamp);
      const timestamp = formatShortTimestamp(timestampStr);
      const level = attributes.logLevel.toUpperCase();
      const colorizedLevel = colorize(level, attributes.logLevel, this.isTTY);
      const context = attributes.serviceName || 'App';

      // Build metadata object from additional attributes and details
      const metadata: Record<string, any> = {};
      if (attributes.details && typeof attributes.details === 'object') {
        const detailKeys = Object.keys(attributes.details);
        if (detailKeys.length > 0) {
          Object.assign(metadata, attributes.details);
        }
      }
      if (additionalLogAttributes && typeof additionalLogAttributes === 'object') {
        const filteredAttrs = Object.entries(additionalLogAttributes).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, any>);

        if (Object.keys(filteredAttrs).length > 0) {
          Object.assign(metadata, filteredAttrs);
        }
      }

      const metadataStr = Object.keys(metadata).length > 0
        ? ' ' + formatCompactMetadata(metadata, this.consoleOptions.maxValueLength!)
        : '';

      // Parse message if it's a JSON string
      let message = attributes.message;
      if (typeof message === 'string' && message.startsWith('"') && message.endsWith('"')) {
        try {
          message = JSON.parse(message);
        } catch {
          // Keep as is if parsing fails
        }
      }

      const processedMessage = processMessageForConsole(String(message), true, this.isTTY);
      console.log(`${timestamp} | ${colorizedLevel} ${context} | ${processedMessage}${metadataStr}`);

      return this.createSilentLogItem();
    } else if (this.logsProvider === RuntimeLogFormatterProvider.RichConsole) {
      // Format: Multi-line with visual separators
      const timestampStr = attributes.timestamp instanceof Date
        ? attributes.timestamp.toISOString()
        : String(attributes.timestamp);
      const timestamp = formatShortTimestamp(timestampStr);
      const level = attributes.logLevel.toUpperCase();
      const colorizedLevel = colorize(level, attributes.logLevel, this.isTTY);
      const context = attributes.serviceName || 'App';

      const separator = this.isTTY ? colorize('──', attributes.logLevel, true) : '──';
      console.log(`${separator} ${colorizedLevel} ${timestamp} | ${context}`);

      // Parse message if it's a JSON string
      let message = attributes.message;
      if (typeof message === 'string' && message.startsWith('"') && message.endsWith('"')) {
        try {
          message = JSON.parse(message);
        } catch {
          // Keep as is if parsing fails
        }
      }

      const processedMessage = processMessageForConsole(String(message), false, this.isTTY);
      console.log(`Message: ${processedMessage}`);

      // Build metadata object
      const metadata: Record<string, any> = {};
      if (attributes.details && typeof attributes.details === 'object') {
        const detailKeys = Object.keys(attributes.details);
        if (detailKeys.length > 0) {
          Object.assign(metadata, attributes.details);
        }
      }
      if (additionalLogAttributes && typeof additionalLogAttributes === 'object') {
        const filteredAttrs = Object.entries(additionalLogAttributes).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, any>);

        if (Object.keys(filteredAttrs).length > 0) {
          Object.assign(metadata, filteredAttrs);
        }
      }

      if (Object.keys(metadata).length > 0) {
        const formattedMeta = formatRichMetadata(
          metadata,
          0,
          this.consoleOptions.maxMetadataDepth!,
        );
        console.log(`Meta:`);
        const lines = formattedMeta.split('\n');
        lines.forEach(line => {
          console.log(`  ${line}`);
        });
      }

      return this.createSilentLogItem();
    } else if (this.logsProvider === RuntimeLogFormatterProvider.Local) {
      console.log(
        `${this.formatTimestamp(attributes.timestamp)}`,
        this.isShortened
          ? baseAttributes.message
          : baseAttributes,
      );
      if (this.isShortened) {
        console.log('Details: ', attributes.details);
        try {
          console.log('Details, stringify: ', JSON.stringify(attributes.details));
        } catch (error) {
          console.warn(`[RuntimeLoggerFormatter] Failed to stringify details: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.log('Details, stringify: ', String(attributes.details));
        }
      }
      return this.createSilentLogItem();
    } else {
      console.log('attributes: ', baseAttributes);
      return this.createSilentLogItem();
    }
  }
}
