// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';
import pc from 'picocolors';

/**
 * Formats an ISO 8601 timestamp to a short format (HH:mm:ss.SSS).
 * Converts to local timezone and provides millisecond precision.
 *
 * @param {string} isoTimestamp - ISO 8601 formatted timestamp string
 * @returns {string} Formatted timestamp in HH:mm:ss.SSS format, or raw string if invalid
 *
 * @example
 * formatShortTimestamp('2025-11-30T12:03:45.123Z') // Returns '12:03:45.123' (in local timezone)
 */
export function formatShortTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn(`[formatShortTimestamp] Invalid timestamp format: ${isoTimestamp}`);
      return isoTimestamp;
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');

    return `${hours}:${minutes}:${seconds}.${ms}`;
  } catch (error) {
    // Fallback to raw string if parsing fails
    console.warn(`[formatShortTimestamp] Error parsing timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return isoTimestamp;
  }
}

/**
 * Detects if the current environment supports TTY (terminal) output with colors.
 * Checks process.stdout.isTTY and respects FORCE_COLOR and NO_COLOR environment variables.
 *
 * @returns {boolean} True if TTY is detected and colors should be enabled
 *
 * @example
 * const shouldColorize = detectTTY(); // Returns true in terminal, false in CI/CD
 */
export function detectTTY(): boolean {
  // NO_COLOR environment variable disables colors (https://no-color.org/)
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // FORCE_COLOR environment variable forces colors
  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }

  // Check if stdout is a TTY
  return process.stdout?.isTTY ?? false;
}

/**
 * Applies ANSI color codes to text based on log level.
 * Only applies colors if enabled parameter is true.
 * Uses picocolors library for cross-platform color support.
 *
 * @param {string} text - The text to colorize
 * @param {string} level - The log level (info, warn, error, debug, critical)
 * @param {boolean} enabled - Whether to apply colors
 * @returns {string} Colorized text if enabled, otherwise plain text
 *
 * @example
 * colorize('ERROR', 'error', true) // Returns red-colored 'ERROR'
 * colorize('INFO', 'info', false) // Returns plain 'INFO'
 */
export function colorize(text: string, level: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }

  const levelLower = level.toLowerCase();

  switch (levelLower) {
    case 'error':
    case 'critical':
      return pc.red(text);
    case 'warn':
      return pc.yellow(text);
    case 'info':
      return pc.green(text);
    case 'debug':
      return pc.cyan(text);
    default:
      return text;
  }
}

/**
 * Truncates a string value if it exceeds the maximum length.
 * Adds an ellipsis indicator when truncation occurs.
 *
 * @param {string} value - The string value to potentially truncate
 * @param {number} maxLength - Maximum allowed length before truncation
 * @returns {string} Original string if within limit, otherwise truncated with '...'
 *
 * @example
 * truncateValue('short', 1000) // Returns 'short'
 * truncateValue('very long string...', 10) // Returns 'very lo...'
 */
export function truncateValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength - 3) + '...';
}

/**
 * Formats metadata as compact single-line JSON.
 * Handles circular references gracefully and truncates long values.
 *
 * @param {any} obj - The metadata object to serialize
 * @param {number} maxLength - Maximum length for the entire JSON string
 * @returns {string} Compact JSON representation or error message
 *
 * @example
 * formatCompactMetadata({ userId: 123 }, 1000) // Returns '{"userId":123}'
 */
export function formatCompactMetadata(obj: any, maxLength: number): string {
  try {
    // Handle circular references with a replacer function
    const seen = new WeakSet();
    const json = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });

    return truncateValue(json, maxLength);
  } catch (error) {
    return `[Serialization Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

/**
 * Formats a single value for enterprise-readable output.
 * Handles primitives, arrays, and nested objects with proper formatting.
 *
 * @param {any} value - The value to format
 * @param {number} indent - Current indentation level
 * @param {number} currentDepth - Current nesting depth
 * @param {number} maxDepth - Maximum allowed nesting depth
 * @param {WeakSet<object>} seen - Set of already visited objects (circular reference detection)
 * @returns {string} Formatted value string
 */
function formatValue(
  value: any,
  indent: number,
  currentDepth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): string {
  // Handle null/undefined
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  // Handle primitives
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // Handle Date
  if (value instanceof Date) return value.toISOString();

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (currentDepth >= maxDepth) return '[...]';

    // Check for circular reference
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    // For simple arrays (primitives only), format inline
    const isSimpleArray = value.every(
      (item) => typeof item !== 'object' || item === null,
    );
    if (isSimpleArray && value.length <= 5) {
      return `[${value.map((v) => (typeof v === 'string' ? v : String(v))).join(', ')}]`;
    }

    // For complex arrays, format each item on new line
    const items = value.map((item, index) => {
      const formattedItem = formatValue(item, indent + 2, currentDepth + 1, maxDepth, seen);
      return `${'  '.repeat(indent + 1)}[${index}]: ${formattedItem}`;
    });
    return `\n${items.join('\n')}`;
  }

  // Handle objects
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (currentDepth >= maxDepth) return '{...}';

    // Check for circular reference
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const lines = keys.map((key) => {
      const formattedValue = formatValue(value[key], indent + 2, currentDepth + 1, maxDepth, seen);
      // If the formatted value starts with newline, it's a nested structure
      if (formattedValue.startsWith('\n')) {
        return `${'  '.repeat(indent + 1)}${key}:${formattedValue}`;
      }
      return `${'  '.repeat(indent + 1)}${key}: ${formattedValue}`;
    });
    return `\n${lines.join('\n')}`;
  }

  // Fallback for unknown types
  return String(value);
}

/**
 * Formats metadata as enterprise-readable key-value pairs with depth limiting.
 * Provides human-friendly output instead of raw JSON for better readability.
 *
 * @param {any} obj - The metadata object to serialize
 * @param {number} currentDepth - Current nesting depth (starts at 0)
 * @param {number} maxDepth - Maximum allowed nesting depth
 * @returns {string} Enterprise-readable key-value representation
 *
 * @example
 * formatRichMetadata({ method: 'GET', url: '/api/users' }, 0, 3)
 * // Returns:
 * // method: GET
 * // url: /api/users
 *
 * formatRichMetadata({ user: { id: 123, name: 'John' } }, 0, 3)
 * // Returns:
 * // user:
 * //   id: 123
 * //   name: John
 */
export function formatRichMetadata(obj: any, currentDepth: number, maxDepth: number): string {
  if (currentDepth >= maxDepth) {
    return '[Max Depth Reached]';
  }

  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== 'object') {
    return String(obj);
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return '(empty)';
  }

  try {
    const seen = new WeakSet<object>();
    seen.add(obj);

    const lines = keys.map((key) => {
      const value = obj[key];
      const formattedValue = formatValue(value, 0, currentDepth + 1, maxDepth, seen);

      // If the formatted value starts with newline, it's a nested structure
      if (formattedValue.startsWith('\n')) {
        return `${key}:${formattedValue}`;
      }
      return `${key}: ${formattedValue}`;
    });

    return lines.join('\n');
  } catch (error) {
    return `[Serialization Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

/**
 * Escapes newline characters in a string for compact single-line output.
 * Converts \n to \\n and \r to \\r for display purposes.
 *
 * @param {string} text - The text to escape
 * @returns {string} Text with newlines escaped
 *
 * @example
 * escapeNewlines('line1\nline2') // Returns 'line1\\nline2'
 */
export function escapeNewlines(text: string): string {
  return text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/**
 * Strips ANSI escape codes from a string.
 * Useful for removing color codes in non-TTY environments or when processing log messages.
 *
 * @param {string} text - The text potentially containing ANSI codes
 * @returns {string} Text with ANSI codes removed
 *
 * @example
 * stripAnsiCodes('\x1b[31mRed Text\x1b[0m') // Returns 'Red Text'
 */
export function stripAnsiCodes(text: string): string {
  // Pattern matches ANSI escape sequences
  // \x1b[ followed by any number of digits/semicolons and ending with a letter
  const ansiPattern = /\x1b\[[0-9;]*[a-zA-Z]/g;
  return text.replace(ansiPattern, '');
}

/**
 * Processes a log message for console output based on formatter type and TTY detection.
 * Handles Unicode characters (preserves them), newlines (escapes for compact, preserves for rich),
 * and ANSI codes (strips in non-TTY, preserves in TTY).
 *
 * @param {string} message - The log message to process
 * @param {boolean} isCompact - Whether using compact formatter (true) or rich formatter (false)
 * @param {boolean} isTTY - Whether output is to a TTY environment
 * @returns {string} Processed message ready for console output
 *
 * @example
 * // Compact formatter, TTY environment
 * processMessageForConsole('Hello\nWorld 🌍', true, true) // Returns 'Hello\\nWorld 🌍'
 *
 * // Rich formatter, non-TTY environment
 * processMessageForConsole('Hello\nWorld 🌍', false, false) // Returns 'Hello\nWorld 🌍'
 *
 * // Compact formatter, non-TTY with ANSI codes
 * processMessageForConsole('\x1b[31mError\x1b[0m', true, false) // Returns 'Error'
 */
export function processMessageForConsole(message: string, isCompact: boolean, isTTY: boolean): string {
  let processed = message;

  // Unicode characters are preserved in all cases (no processing needed)

  // Handle newlines based on formatter type
  if (isCompact) {
    // Compact formatter: escape newlines for single-line output
    processed = escapeNewlines(processed);
  }
  // Rich formatter: preserve newlines (no change needed)

  // Handle ANSI codes based on TTY detection
  if (!isTTY) {
    // Non-TTY: strip existing ANSI codes from the message
    processed = stripAnsiCodes(processed);
  }
  // TTY: preserve ANSI codes (no change needed)

  return processed;
}

/**
 * Suggests an appropriate formatter based on the STAGE environment variable.
 * Provides automatic formatter selection for different deployment environments.
 *
 * @param {string} [stage] - Optional stage override. If not provided, uses process.env.STAGE
 * @returns {'aws' | 'compact-console' | 'rich-console'} Suggested formatter type
 *
 * @example
 * // In local development (STAGE=dev or STAGE=local)
 * suggestFormatterByEnvironment() // Returns 'compact-console'
 *
 * // In production (STAGE=production or STAGE=prod)
 * suggestFormatterByEnvironment() // Returns 'aws'
 *
 * // Explicit stage override
 * suggestFormatterByEnvironment('dev') // Returns 'compact-console'
 *
 * @remarks
 * Usage pattern for automatic formatter selection:
 * ```typescript
 * import { suggestFormatterByEnvironment } from './console.formatter.utils';
 * import { RuntimeLoggerFormatter } from './runtime.logger.formatter';
 *
 * const formatter = new RuntimeLoggerFormatter({
 *   logsProvider: suggestFormatterByEnvironment(),
 * });
 * ```
 *
 * Environment mapping:
 * - 'dev', 'local', 'development' → 'compact-console' (one-line format for quick scanning)
 * - 'production', 'prod', 'staging' → 'aws' (structured JSON for CloudWatch)
 * - Default (unknown stage) → 'aws' (safe default for production)
 */
export function suggestFormatterByEnvironment(stage?: string): 'aws' | 'compact-console' | 'rich-console' {
  const currentStage = (stage || process.env.STAGE || '').toLowerCase();

  // Local development stages use compact console formatter
  const localStages = ['dev', 'local', 'development'];
  if (localStages.includes(currentStage)) {
    return 'compact-console';
  }

  // Production and staging use AWS formatter for structured logging
  const productionStages = ['production', 'prod', 'staging'];
  if (productionStages.includes(currentStage)) {
    return 'aws';
  }

  // Default to AWS formatter for unknown stages (safe default)
  return 'aws';
}
