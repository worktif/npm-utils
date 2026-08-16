// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { LoggerInterface } from '@utils/structure';
import { BeforeInstance } from '@utils/decorators';
import { LoggerInstance, LoggerLevel } from '@utils/logger/logger.types';
import { initLog } from '@utils/logger';
import { composeBeforeInstance } from '@utils/decorators/decorators.utils';


/**
 * Injects a logger instance into the HttpClient and sets the log level to Info.
 *
 * @param {string} description - The description for the logger.
 *
 * @return {Promise<void>} - A Promise that resolves when the logger instance is injected.
 */
export function loggerInjector(description: string) {
  return async function (this: LoggerInterface): Promise<BeforeInstance> {
    if (!this.loggerInstance) {
      throw new Error('Logger Instance not found.');
    }
    const log: LoggerInstance = await initLog(
      this.loggerInstance,
      description,
      LoggerLevel.Info,
    );
    return composeBeforeInstance({ log });
  };
}
