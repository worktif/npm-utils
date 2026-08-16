// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import { LoggerLevel, LogLevelExport } from '@utils/logger/logger.types';
import { LogLevel } from '@aws-lambda-powertools/logger/lib/cjs/types';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { bundle } from '../../bundle';

/**
 * Constant defines new line [Escape Sequence]{@link https://en.wikipedia.org/wiki/Escape_sequences_in_C}.
 * @type {string}
 */
export const EMPTY_LINE = '\n';

/**
 * [ANSI escape code]{@link https://en.wikipedia.org/wiki/ANSI_escape_code} to define terminal font color: red.
 * @type {string}
 */
export const ANSI_FG_RED = '\x1b[31m';

/**
 * [ANSI escape code]{@link https://en.wikipedia.org/wiki/ANSI_escape_code} to define terminal font color: yellow.
 * @type {string}
 */
export const ANSI_FG_YELLOW = '\x1b[33m';

/**
 * [ANSI escape code]{@link https://en.wikipedia.org/wiki/ANSI_escape_code} to define terminal font color: green.
 * @type {string}
 */
export const ANSI_FG_GREEN = '\x1b[32m';

/**
 * [ANSI escape code]{@link https://en.wikipedia.org/wiki/ANSI_escape_code} to define terminal font color: default.
 * @type {string}
 */
export const ANSI_FG_NC = '\x1b[0m'; // no color

/**
 * Node.js [`child_process.exec`]{@link https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback} callback handler.<br>
 * Note: callback changes the order of the default [`child_process.exec`]{@link https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback} process callback: (error, response, stderr) to (response, stderr, error)
 * @param {Function} callback - [`child_process.exec`]{@link https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback} process callback according to the next arguments order: `response`, `stderr`, `error`
 * @param {Object} exitConditions - Controls the process running process. Arguments interact with bundle.cli.logger
 * @example
 * exec('ps', execAction((response, stderr, error) => {
 *  bundle.cli.logger.stack([
 *    [`${ANSI_FG_GREEN}%s${ANSI_FG_NC}`, `Response:`],
 *    [response],
 *  ]);
 *
 *  bundle.cli.logger.stack([
 *    [`${ANSI_FG_RED}%s${ANSI_FG_NC}`, `Standard error:`],
 *    [stderr || 'No Standard Error', EMPTY_LINE],
 *  ]);
 *
 *  bundle.cli.logger.stack([
 *    [`${ANSI_FG_RED}%s${ANSI_FG_NC}`, `Error:`],
 *    [error || 'No Error', EMPTY_LINE],
 *  ]);
 * }));
 * @return {Function} Default [`child_process.exec`]{@link https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback} process callback
 */
export function execAction(callback: any, exitConditions = { error: true, stderr: true }) {
  return (error: any, response: any, stderr: any) => {
    bundle.cli.logger.error(error, stderr, exitConditions);
    callback(response, stderr, error);
  };
}

/**
 * Stops process and displays message.
 * @param {string[]} args - Array of [console.log]{@link https://nodejs.org/api/console.html#console_console_log_data_args} arguments
 */
export function stop(args: string[]) {
  if (args && args.length !== 0) {
    bundle.cli.logger.stack([args]);
  }
  process.exit(0);
}

/**
 * The default log level used by the Logger.
 *
 * @type {LogLevelExport}
 * @default LoggerLevel.Info
 */
export const DEFAULT_LOG_LEVEL: LogLevelExport = LoggerLevel.Info;

/**
 * Maps a specified log level to its corresponding log type. If the provided log level
 * does not match any defined type, a default level is returned.
 *
 * @param {LoggerLevel} logLevel - The log level to be mapped to its corresponding log type.
 * @param {Partial<LogLevel>} [defaultLevel=DEFAULT_LOG_LEVEL] - The default log level to
 *        return if the provided log level is not defined.
 * @returns {Partial<LogLevelExport>} The mapped log type corresponding to the given log level,
 *          or the default level if no match is found.
 */
export const defineLogType = (
  logLevel: LoggerLevel,
  defaultLevel: Partial<LogLevel> = DEFAULT_LOG_LEVEL,
): Partial<LogLevelExport> => {
  return (
    {
      [LoggerLevel.Debug]: 'debug' as LogLevelExport,
      [LoggerLevel.Info]: 'info' as LogLevelExport,
      [LoggerLevel.Error]: 'error' as LogLevelExport,
      [LoggerLevel.Silent]: 'debug' as LogLevelExport, // @note: silent is absent, debug instead
      [LoggerLevel.Warn]: 'warn' as LogLevelExport,
      [LoggerLevel.Critical]: 'critical' as LogLevelExport,
    }[logLevel] || (defaultLevel as LogLevelExport)
  );
};

/**
 * Represents the configuration option name for enabling or specifying
 * the logger's detailed informational output.
 *
 * This constant is used to identify the logger's informational detail level
 * setting in configuration or runtime parameters.
 *
 * Value: 'details'
 */
export const LOGGER_INFO_OPTION_NAME = 'details';

/**
 * Writes a log file for a specified action with given data. Logs are stored in a `.logs` directory
 * within the current working directory, and the action name is sanitized for safe file naming.
 *
 * @param {string} actionName - The name of the action for which the log is being written. Unsafe characters will be replaced with underscores.
 * @param {any} data - The data to be logged. It will be serialized into JSON format and written to the log file.
 * @return {void} This function does not return a value.
 */
export function writeLog(actionName: string, data: any) {
  const logsDir: string = path.join(process.cwd(), '.logs');
  const safeName: string = actionName.replace(/[^a-z0-9_\-]/gi, '_');
  const logFilePath: string = path.join(logsDir, `.${safeName}.log`);

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.writeFileSync(logFilePath, `${JSON.stringify(data)}\n`, {});
}
