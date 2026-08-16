// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { injectable } from 'inversify';

import { ANSI_FG_NC, ANSI_FG_RED } from '@utils/logger/logger.utils';

/**
 * Provides extended functionalities for the Logger CLI plugin, including utilities for managing
 * and displaying logs and errors in a standardized output format.
 *
 * This class is designed to support improved logging mechanisms with an emphasis on clarity
 * and adherence to Unix output conventions.
 */
@injectable()
export class LoggerCliPluginExt {

  /**
   * Represents the namespace or identifier for the extended Logger CLI plugin.
   *
   * This variable is intended to be used as a constant within the system to identify or manage the
   * extended functionalities of the Logger CLI (Command Line Interface) plugin.
   *
   * The value of `DiExt` is a string that uniquely designates the extension, ensuring consistency
   * when referencing this particular plugin in the application.
   *
   * @constant {string} DiExt
   */
  static readonly DiExt = 'LoggerCliPlugin_ext';

  /**
   * Displays the stack of messages.<br>
   * Message is an array of [console.log]{@link https://nodejs.org/api/console.html#console_console_log_data_args} arguments.
   * @param {string[][]} logStack - Stack of [console.log]{@link https://nodejs.org/api/console.html#console_console_log_data_args} arguments arrays
   * @example
   * Logger.stack([
   *    [`${ANSI_FG_GREEN}%s${ANSI_FG_NC}`, `Response:`],
   *    [response],
   *  ]);
   */
  stack(logStack: string[][]) {
    logStack.forEach((log) => {
      console.log(...log);
    });
  }

  /**
   * Displays an error according to unix output standard with Node.js improvement.
   * @param {Error} error - Instance of Error object. Can be thrown when runtime errors occur.
   * @param {string | Buffer} stderr - `stderr` unix output string
   * @param {Object} exitConditions - Controls an invalid running process
   * @example
   * Logger.error(error, stderr, { error: true, stderr: false });
   */
  error(error: any, stderr: any, exitConditions = { error: true, stderr: true }) {
    if (error !== null) {
      this.stack([[`${ANSI_FG_RED}%s${ANSI_FG_NC}`, `Error: ${error}`]]);
      if (exitConditions.error) {
        process.exit(0);
      }
    }
    if (stderr) {
      this.stack([[`%s`, stderr]]);
      if (exitConditions.stderr) {
        process.exit(0);
      }
    }
  }
}
