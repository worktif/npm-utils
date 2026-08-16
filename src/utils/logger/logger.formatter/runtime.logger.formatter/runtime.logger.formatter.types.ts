// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';


/**
 * Enum representing providers for log formatting in the Runtime system.
 *
 * This enumeration is utilized to standardize the available log formatter providers,
 * ensuring consistency and maintainability when working with various log formatting mechanisms.
 *
 * Members:
 * - Aws: Represents the AWS log formatter provider.
 * - Local: Represents the local log formatter provider (deprecated, use CompactConsole or RichConsole).
 * - Custom: Represents a custom log formatter provider.
 * - CompactConsole: Represents a compact single-line console formatter for local development.
 * - RichConsole: Represents a rich multi-line console formatter for detailed debugging.
 *
 * Note: This enum can be extended with additional providers as needed in the future.
 */
export enum RuntimeLogFormatterProvider {
  Aws = 'aws',
  Local = 'local',
  Custom = 'custom',
  CompactConsole = 'compact-console',
  RichConsole = 'rich-console',
  /* @note: can be extended */
}

/**
 * Options for configuring console formatters (CompactConsole and RichConsole).
 *
 * @typedef {Object} ConsoleFormatterOptions
 * @property {boolean} [colorize] - Whether to apply ANSI color codes. Auto-detects TTY if undefined.
 * @property {number} [maxMetadataDepth] - Maximum depth for nested metadata objects. Default: 3.
 * @property {number} [maxValueLength] - Maximum length for string values before truncation. Default: 1000.
 * @property {'short' | 'full'} [timestampFormat] - Timestamp format: 'short' (HH:mm:ss.SSS) or 'full' (ISO 8601). Default: 'short'.
 */
export type ConsoleFormatterOptions = {
  colorize?: boolean;
  maxMetadataDepth?: number;
  maxValueLength?: number;
  timestampFormat?: 'short' | 'full';
};

/**
 * Options for configuring the RuntimeLogFormatter.
 *
 * @typedef {Object} RuntimeLogFormatterOptions
 * @property {RuntimeLogFormatterProvider} logsProvider - The provider responsible for handling and formatting log data.
 * @property {boolean} [isShortened] - Whether to use shortened output format (deprecated, use consoleOptions instead).
 * @property {ConsoleFormatterOptions} [consoleOptions] - Configuration options for console formatters (CompactConsole and RichConsole).
 */
export type RuntimeLogFormatterOptions = {
  logsProvider: RuntimeLogFormatterProvider;
  isShortened?: boolean;
  consoleOptions?: ConsoleFormatterOptions;
}
