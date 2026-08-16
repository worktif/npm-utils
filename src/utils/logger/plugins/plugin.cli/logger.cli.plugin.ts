// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { inject, injectable } from 'inversify';
import { LazyServiceIdentifier } from '@inversifyjs/common';

import { composeFactoryBind, Di } from '@utils/di';

import { LogItemMessage } from '@aws-lambda-powertools/logger/lib/esm/types';

import { EnvConfigDefault } from '@core/config/env.config.default';

import { ANSI_FG_GREEN, ANSI_FG_NC, ANSI_FG_RED, initLog } from '@utils/logger';
import { LoggerInstance, LoggerInstanceOptions, LoggerLevel } from '@utils/logger/logger.types';
import { LoggerCliPluginExt } from '@utils/logger/plugins';
import { Maybe } from '@utils/common';
import { Logger } from '@aws-lambda-powertools/logger';


/**
 * Represents a CLI logger plugin that provides utilities for processing and logging data
 * synchronously or asynchronously.
 *
 * Implements the `LoggerInstance` interface to standardize logging behavior.
 *
 * This class comes with mechanisms to process payloads immediately or handle promises
 * with logging and formatting capabilities using customizable options.
 */
@injectable()
export class LoggerCliPlugin implements LoggerInstance {
  /**
   * The defaultProvider variable stores the default provider name
   * for a specific context or utility.
   *
   * It is set to the string `Work TIF – Utils`, which may represent
   * the associated provider or service utilized in the application.
   */
  protected readonly defaultProvider: 'Work TIF – Utils' = `Work TIF – Utils`;

  /**
   * Represents an optional string value.
   * `Maybe<string>` is a type that can either hold a string or be undefined/null.
   * This variable may or may not contain a valid string.
   */
  protected readonly provider: Maybe<string>;

  /**
   * An object `serializer` containing a method to transform or process a stage string.
   *
   * @property {Function} stage - A method that takes a stage string as an argument and returns the processed string.
   * @param {string} stage - The input string representing a stage.
   * @returns {string} The processed stage string.
   */
  private serializer = {
    stage: (stage: string) => ['dev'].includes(stage)
      ? `${ANSI_FG_GREEN}${stage.toUpperCase()}${ANSI_FG_NC}`
      : stage.toUpperCase(),
  };
  /**
   * Processes a payload and returns it with the ability to log or format using optional settings.
   *
   * @param {any | any[]} payload - The input data to be processed. Can be a single item or an array of items.
   * @param {LoggerInstanceOptions} [options] - Optional configuration object for logging behavior or processing options.
   * @returns {any[] | any} Returns either a single processed item or an array of processed items, based on the input.
   */
  now: (payload: any | any[], options?: LoggerInstanceOptions) =>
    any[] | any =
    (): any[] | any =>
      (): void =>
        console.log(`Logger is not initialised.`);

  /**
   * A higher-order function that creates a logger-bound function for handling promises or async functions.
   * The specific behavior is determined by the implementation provided in the logging utility.
   *
   * @function
   * @param {any} [extension] - An optional parameter for extending or customizing the logger's behavior.
   * @returns {function} A function that takes a promise or a function returning a promise,
   * and optional logger instance options, then logs and handles the promise execution.
   *
   * @param {Promise<unknown>} promiseOrFunction - A promise or a function returning a promise to be logged and processed.
   * @param {LoggerInstanceOptions} [options] - Optional configuration for logging behavior during the promise execution.
   * @returns {Promise<never|never[]>} A promise that resolves to never or an empty array.
   */
  future: (promiseOrFunction: Promise<unknown>, options?: LoggerInstanceOptions) =>
    Promise<never[] | never | LogItemMessage> =
    (): Promise<never[] | never | LogItemMessage> =>
      new Promise((resolve, reject) => {
        console.log(`Logger is not initialised.`);
        resolve([]);
      });

  /**
   * Creates an instance of the class and initializes logging.
   *
   * @param {EnvConfigDefault} envConfig - The environment configuration object which provides bundle and stage details.
   * @param loggerCliPluginExt
   * @return {void} - Does not return anything as this is a constructor.
   */
  constructor(
    @inject(new LazyServiceIdentifier(() => composeFactoryBind(Di.EnvConfigDefaultBind)))
    protected envConfig: EnvConfigDefault,
    @inject(new LazyServiceIdentifier(() => composeFactoryBind(Di.LoggerCli_plugin_ext)))
    protected loggerCliPluginExt: LoggerCliPluginExt,
  ) {
    const logger: Promise<LoggerInstance> = initLog(
      console as unknown as Logger,
      this.envConfig.bundle.stage
        ? `${this.envConfig.bundle.provider ?? this.provider ?? this.defaultProvider} | ${this.serializer.stage(this.envConfig.bundle.stage)}`
        : `${this.envConfig.bundle.provider ?? this.provider ?? this.defaultProvider}`,
      LoggerLevel.Debug);
    logger.then(async ({ now, future }) => {
      this.now = (payload: any | any[], options?: LoggerInstanceOptions) => {
        const logResult = now(payload, options);
        loggerCliPluginExt.stack(logResult);
        return logResult;
      };
      this.future = async (payload: Promise<unknown>, options?: LoggerInstanceOptions) => {
        const logResult: never[] | never | LogItemMessage = await future(payload, options);
        loggerCliPluginExt.stack([logResult as never[] | never]);
        return logResult as never[] | never | LogItemMessage;
      };
    });
  }

  /**
   * Processes a stack of log entries by iterating through each log and performing an operation on it.
   *
   * @param {string[][]} logStack - A two-dimensional array where each inner array represents a log entry to be processed.
   * @return {void} Does not return a value.
   */
  stack(logStack: string[][]) {
    logStack.forEach((log) => {
      this.now(log);
    });
  }

  /**
   * Handles errors and standard error output, and optionally exits the process based on conditions.
   *
   * @param {any} error - The error object or message to process.
   * @param {any} stderr - The standard error output to process.
   * @param {Object} [exitConditions={ error: true, stderr: true }] - Conditions that determine whether the process should exit on error or stderr.
   * @param {boolean} [exitConditions.error=true] - Whether to exit the process when an error occurs.
   * @param {boolean} [exitConditions.stderr=true] - Whether to exit the process when there is standard error output.
   * @return {void} This function does not return anything.
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
