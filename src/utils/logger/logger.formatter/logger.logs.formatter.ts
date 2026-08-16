// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { LogFormatter, LogItem } from '@aws-lambda-powertools/logger';
import { LogAttributes, UnformattedAttributes } from '@aws-lambda-powertools/logger/types';

import { injectable } from 'inversify';

/**
 * The `LoggerLogsFormatter` class is responsible for formatting and transforming log attributes
 * into a structured log item. It extends functionality from the `LogFormatter` base class.
 */
@injectable()
export class LoggerLogsFormatter extends LogFormatter {
  public formatAttributes(
    attributes: UnformattedAttributes,
    additionalLogAttributes: LogAttributes,
  ): LogItem {

    const logItem = new LogItem({ attributes });
    // add any attributes not explicitly defined
    logItem.addAttributes(additionalLogAttributes);

    return logItem;
  }
}
