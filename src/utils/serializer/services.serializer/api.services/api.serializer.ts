// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { injectable } from 'inversify';

import { Logger } from '@aws-lambda-powertools/logger';

import { RuntimeLogFormatterProvider, RuntimeLoggerFormatter, logger } from '@utils/logger';
import { LoggerInterface } from '@utils/structure';

/**
 * ApiSerializer is a utility class designed for handling serialization processes.
 * Implements `LoggerInterface` to integrate with a logger instance for capturing logs.
 * This class provides methods to manage identity conversion of data.
 */
@injectable()
export class ApiSerializer /*implements LoggerInterface*/ {
  /**
   * A singleton instance of the Logger class configured with a specific service name.
   *
   * This logger is pre-initialized to be used within the Serializer service of the application.
   * It is set up with the `serviceName` parameter specifying its related file path for better traceability
   * and debugging within log entries.
   *
   * Use this instance to log messages such as debug information, warnings, and errors throughout
   * the Serializer service’s workflow and APIs.
   *
   * @type {Logger}
   * @constant
   */
  // loggerInstance: Logger = logger({
  //   serviceName: '@utils/serializer/services.serializer/api.services/api.serializer.ts',
  //   logFormatter: new RuntimeLoggerFormatter({
  //     logsProvider: RuntimeLogFormatterProvider.RichConsole,
  //   }) as any,
  // });

  /**
   * Initializes a new instance of the class and binds the `identity` method to the current instance.
   *
   * @return {Object} A new instance of the class with the `identity` method bound.
   */
  constructor() {
    this.identity = this.identity.bind(this);
  }

  /**
   * Processes the given input and returns it in the desired type.
   *
   * @template RS - The type of the input value.
   * @template T - The type of the returned value.
   * @param {RS} bodyOrResponse - The input value to be processed.
   * @return {T} The processed output in the desired type.
   */
  identity<RS, T>(bodyOrResponse: RS): T {
    return this._identity<T>(bodyOrResponse);
  }

  // @consider: life-hack, how to solve?
  protected _identity<T>(bodyOrResponse: any): T {
    return bodyOrResponse as T;
  }

  // ...
}
