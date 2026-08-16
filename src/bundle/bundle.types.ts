// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { LoggerCliPlugin } from '@utils/logger/plugins';
import { LoggerLogsFormatter } from '@utils/logger';

/**
 * LoggerCliFormatter is a type definition representing a formatting configuration
 * for CLI logging. It includes formatting strategies for local environments and AWS environments.
 *
 * @typedef {Object} LoggerCliFormatter
 * @property {LoggerLogsFormatter} local - Formatting configuration for local environment logging.
 * @property {LoggerLogsFormatter} aws - Formatting configuration for AWS environment logging.
 */
export type LoggerCliFormatter = {
  local: LoggerLogsFormatter;
  shortened: LoggerLogsFormatter;
  aws: LoggerLogsFormatter
}

/**
 * Represents the configuration for the CLI application's bundle functionality.
 * This type encapsulates the logger plugin that provides logging capabilities.
 *
 * @typedef {Object} BundleCli
 * @property {LoggerCliPlugin} logger - The logger plugin used for CLI logging functionality.
 */
export type BundleCli = {
  logger: LoggerCliPlugin;
  loggerFormatter: LoggerCliFormatter;
}


