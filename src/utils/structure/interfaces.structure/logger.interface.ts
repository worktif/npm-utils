// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Logger } from '@aws-lambda-powertools/logger';

/**
 * Represents a logger interface.
 *
 * This interface defines the contract for a logger implementation.
 */
export interface LoggerInterface {

  /**
   * Represents an instance of the Logger class used for logging messages or data.
   * This variable provides methods to output logs such as error, warning, info, or debug messages,
   * facilitating the tracking of application behavior, errors, and performance.
   */
  loggerInstance: Logger;
}
