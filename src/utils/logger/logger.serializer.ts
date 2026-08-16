// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import curryRight from 'lodash/curryRight';
import identity from 'lodash/identity';
import get from 'lodash/get';

import {
  EntityLoggerSerializer,
  EntityLoggerSerializerMap,
  EntitySerializer,
  LoggerInstanceOptions,
} from '@utils/logger/logger.types';
import { Maybe } from '@utils/common/common.types';
import { Logger } from '@aws-lambda-powertools/logger';

/**
 * Represents a map of logger serializers.
 *
 * @typedef {Object} EntityLoggerSerializerMap
 * @property {Function} axios - Serializes data returned by Axios requests.
 * @property {Function} merchantConfig - Serializes merchant configuration data.
 */
export const loggerSerializers: EntityLoggerSerializerMap = { axios: curryRight<string, any, any>(get)(void 0)('data') };


/**
 * Maps the logger instance options using the specified mapper function.
 *
 * @param {Maybe<LoggerInstanceOptions>} options - The logger instance options to map.
 * @param {Logger} loggerInstance - The logger instance to pass to the mapper function.
 * @returns {Promise<Maybe<EntitySerializer>>} - The mapped logger instance options.
 */
export function mapOptionsToSerializer(
  options: Maybe<LoggerInstanceOptions>,
): Maybe<EntitySerializer> {
  return options &&
  options.serializer !== void 0 &&
  typeof (options.serializer as any).then === 'function'
    ? void 0 // @note: sync logger mapper avoid logger instance
    : options &&
    options.serializer !== void 0 &&
    typeof (options.serializer as any).then !== 'function'
      ? (options.serializer as EntitySerializer)
      : identity;
}

/**
 * Maps options to an async serializer.
 *
 * @param {Maybe<LoggerInstanceOptions>} options - The options object.
 * @param {Logger} loggerInstance - The logger instance.
 *
 * @returns {Promise<Maybe<EntitySerializer>>} - A Promise that resolves to the mapped async serializer.
 */
export async function mapOptionsToAsyncSerializer(
  options: Maybe<LoggerInstanceOptions>,
  loggerInstance: Logger | typeof console,
): Promise<Maybe<EntitySerializer>> {
  return options &&
  options.serializer !== void 0 &&
  typeof (options.serializer as any).then === 'function'
    ? ((await (options.serializer as EntityLoggerSerializer)(
      loggerInstance,
    )) as EntitySerializer)
    : options &&
    options.serializer !== void 0 &&
    typeof (options.serializer as any).then !== 'function'
      ? (options.serializer as EntitySerializer)
      : identity;
}
