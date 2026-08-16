// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Logger, LogLevel } from '@aws-lambda-powertools/logger';
import { ConstructorOptions, LogItemMessage } from '@aws-lambda-powertools/logger/types';
import * as process from 'node:process';
import get from 'lodash/get';

import { Maybe } from '@utils/common/common.types';
import {
  EntitySerializer,
  LoggerInstance,
  LoggerInstanceOptions,
  LoggerLevel,
  LogInfoOptions,
} from '@utils/logger/logger.types';
import { defineLogType, LOGGER_INFO_OPTION_NAME } from '@utils/logger/logger.utils';
import { mapOptionsToAsyncSerializer, mapOptionsToSerializer } from '@utils/logger/logger.serializer';
import { isBrowser } from '@utils/common';
import { LoggerLogsFormatter } from '@utils/logger/logger.formatter/logger.logs.formatter';

/**
 * Environment Variables:
 *
 * - `STAGE`: Determines the application environment (dev, staging, prod, etc.)
 * - `RUNTIME_DEBUG`: Controls DEBUG log visibility for @worktif/utils package
 *   - Set to 'true' to enable DEBUG logs
 *   - DEBUG logs are hidden by default (even if logger level is DEBUG)
 *   - This affects the entire @worktif/utils package, not just the logger
 *
 * Example usage:
 * ```bash
 * # Enable DEBUG logs for @worktif/utils
 * export RUNTIME_DEBUG=true
 *
 * # Disable DEBUG logs (default)
 * unset RUNTIME_DEBUG
 * # or
 * export RUNTIME_DEBUG=false
 * ```
 */

/**
 * Represents the current stage or environment in which the application is running.
 *
 * The value is determined based on the environment:
 * - In a non-browser (server-side) environment, it uses the environment variable `STAGE`, defaulting to `'local'` if `STAGE` is not defined.
 * - In a browser environment, it defaults to `'local'`.
 *
 * This variable is typically used to configure behavior or settings specific to the application's runtime environment, such as
 * development, staging, or production.
 *
 * @type {string}
 */
const stage: string = !isBrowser ? process.env.STAGE ?? 'local' : 'local';

/**
 * Represents the default name of the service to be used in contexts where a
 * service name is required but not explicitly provided.
 *
 * This variable is typically utilized to assign a consistent identifier to logs,
 * processes, or operations originating from a specific service, especially as a
 * fallback value.
 *
 * The default value is set to 'Log'.
 */
const DEFAULT_SERVICE_NAME = 'Logs |';


/**
 * Represents the default configuration for a Logger service.
 *
 * @typedef {Object} ConstructorOptions
 * @property {string} serviceName - The name of the service.
 * @property {number} sampleRateValue - The sample rate value for logging.
 * @property {string} logLevel - The log level for logging.
 */
const defaultConfig: ConstructorOptions = {
  serviceName: DEFAULT_SERVICE_NAME,
  // sampleRateValue: 0 disables AWS Logger's automatic DEBUG sampling
  // This prevents internal messages like "Setting log level to DEBUG due to sampling rate"
  // Users can still enable DEBUG via LOG_LEVEL=DEBUG or config.logLevel: 'DEBUG'
  sampleRateValue: 0,
  // Always use INFO as default log level
  // DEBUG logs are controlled by RUNTIME_DEBUG environment variable
  logLevel: 'INFO',
};


/**
 * Creates a new instance of Logger with the provided configuration.
 *
 * @param {Object} config - The configuration options for the logger. (optional)
 * @param {string} config.serviceName - The name of the service. If provided, it will be appended to the default service name. (optional)
 * @returns {Logger} - A new instance of Logger.
 */
export const logger = (config: ConstructorOptions = {}): Logger => {
  // Check if DEBUG is enabled via environment variable
  const isDebugEnabled = !isBrowser && process.env.RUNTIME_DEBUG === 'true';

  // Override logLevel if DEBUG is requested but not enabled
  // This enforces the DEBUG suppression policy at Logger creation time
  // let effectiveLogLevel = config.logLevel || defaultConfig.logLevel;
  // if (effectiveLogLevel?.toUpperCase() === 'DEBUG' && !isDebugEnabled) {
  //   effectiveLogLevel = 'INFO';
  // }

  const loggerInstance = new Logger({
    ...defaultConfig,
    ...config,
    // Priority: config.logLevel > process.env.LOG_LEVEL > defaultConfig.logLevel (INFO)
    logLevel: config.logLevel ?? (!isBrowser && process.env.LOG_LEVEL
      ? process.env.LOG_LEVEL as ConstructorOptions['logLevel']
      : defaultConfig.logLevel),
    serviceName: config?.serviceName
      ? `${config.serviceName}`
      : defaultConfig.serviceName,
    persistentKeys: void 0,
    logFormatter: (config.logFormatter ?? new LoggerLogsFormatter()) as never,
  });

  // Override debug method to block DEBUG logs when RUNTIME_DEBUG is not set
  // This prevents AWS Powertools Logger internal debug messages from appearing
  if (!isDebugEnabled) {
    const originalDebug = loggerInstance.debug.bind(loggerInstance);
    loggerInstance.debug = function (...args: any[]) {
      // Silently ignore all debug calls when DEBUG is not enabled
      return;
    };
  }

  return loggerInstance;
};


/**
 * Initializes a logger with specified parameters.
 * @param {Logger} loggerInstance - The logger instance to use for logging.
 * @param {string} actionName - The name of the action to log.
 * @param {LoggerLevel} logLevel - The log level to use. Defaults to LoggerLevel.Info.
 * @returns {Object} - An object with two methods: "now" and "future".
 */
export const initLog = async (
  loggerInstance: Logger,
  actionName: string,
  logLevel: LoggerLevel = LoggerLevel.Info,
): Promise<LoggerInstance> => {
  /**
   * Logs the provided payload details using the specified options and log configurations.
   *
   * @param {never[] | never} details - The payload details to be logged, which can either be an array or a single value.
   * @param {LoggerInstanceOptions} [options] - Options for the logger instance, including tag or additional parameters.
   * @param {Maybe<LogInfoOptions>} [logOptions] - Optional log configuration that allows specifying a default message or log level.
   * @return {never[] | never | LogItemMessage} - Returns either the input details or a log message containing the formatted log information.
   */
  function logPayload<T extends string = string>(
    details: never[] | never,
    options?: LoggerInstanceOptions,
    logOptions?: Maybe<LogInfoOptions>,
  ): never[] | never | LogItemMessage {
    // @todo: compose by an internal envConfig/config file/etc.
    const serviceName: string = !isBrowser ? process.env.SERVICE_NAME ?? DEFAULT_SERVICE_NAME : DEFAULT_SERVICE_NAME;

    let detailsValue = {};
    if (details && typeof details === 'object' && Object.keys(details).length !== 0) {
      detailsValue = {
        ...detailsValue,
        [LOGGER_INFO_OPTION_NAME]:
          options && options.tag ? { [options.tag]: details } : details,
      };
    } else if (details && typeof details !== 'object') {
      detailsValue = {
        ...detailsValue,
        [LOGGER_INFO_OPTION_NAME]: details,
      };
    }
    const params: LogItemMessage = {
      method: actionName,
      message: get(
        options,
        'message',
        (logOptions && logOptions.defaultMessage)
          ? `${serviceName} | ${(logOptions && logOptions.defaultMessage)}`
          : `${serviceName} | ${logLevel.toUpperCase()} – message is absent`,
      ),
      ...detailsValue,
    };

    const completedParams: T | LogItemMessage = options?.params?.serializer
      ? options.params.serializer<T>(params)
      : params;

    // Check if DEBUG logs should be displayed
    // DEBUG logs are hidden by default and only shown when RUNTIME_DEBUG is set
    const isDebugEnabled = !isBrowser && process.env.RUNTIME_DEBUG === 'true';

    // Get the current log level from options (level or logLevel) or use the default from initLog
    const currentLogLevel = options?.level ?? get(options, 'logLevel', void 0) ?? logLevel;

    // Check if Logger instance is configured with DEBUG level
    const loggerLevelName = loggerInstance.getLevelName?.();
    const isLoggerDebug = loggerLevelName?.toUpperCase() === 'DEBUG';

    // If DEBUG is not enabled, enforce INFO level minimum on the Logger instance
    // This prevents ANY debug logs from appearing, even if Logger is configured with DEBUG
    let wasLoggerDebug = false;
    if (!isDebugEnabled && isLoggerDebug) {
      // Temporarily raise Logger level to INFO to block DEBUG logs
      wasLoggerDebug = true;
      loggerInstance.setLogLevel('INFO' as any);
    }

    // Skip DEBUG logs unless explicitly enabled via environment variable
    // This prevents calling loggerInstance.debug() when RUNTIME_DEBUG is not set
    if (currentLogLevel === LoggerLevel.Debug && !isDebugEnabled) {
      // Restore original log level if it was changed
      if (wasLoggerDebug) {
        loggerInstance.setLogLevel('DEBUG' as any);
      }
      return details;
    }

    if (!isDebugEnabled && (loggerInstance.getLevelName() === LogLevel.DEBUG || params.level === LogLevel.DEBUG || params.level === LoggerLevel.Debug)) {
      return details;
    }

    if (!isDebugEnabled) {
      loggerInstance.debug = function (...args: any[]) {
        return;
      };
    }

    // Log all other levels, or DEBUG when enabled
    loggerInstance[defineLogType(currentLogLevel)](completedParams);

    // Restore original log level if it was changed
    if (wasLoggerDebug) {
      loggerInstance.setLogLevel('DEBUG' as any);
    }
    // writeLog(actionName, params);
    // fs.writeFileSync(path.join(process.cwd(), '.logs', `.[${actionName}].log`), `${JSON.stringify(params)}\n`, {});

    return details;
  }

  return {
    now(
      payload: never[] | never,
      options?: LoggerInstanceOptions,
    ): never[] | never | LogItemMessage {
      let currentPayload: any = payload;
      if (payload instanceof Error) {
        currentPayload = {
          message: payload.message,
          name: payload.name,
          stack: payload.stack,
        };
      }
      const serializer: Maybe<EntitySerializer> = mapOptionsToSerializer(options);
      const details = (
        serializer !== void 0 ? serializer(currentPayload) : currentPayload
      ) as never | never[];

      /* @note: null, void, other non-valuable instances MUST be logged as well */
      if (typeof currentPayload === 'object' || typeof currentPayload === 'string' || !currentPayload) {
        return logPayload(details, options);
      } else {
        const FAILED_LOGGER_PAYLOAD_MESSAGE = `The Logger currentPayload appears to be neither an object, nor a string. Please verify the lambda in the following action: ${actionName}.`;

        return logPayload(
          details,
          Object.assign({}, options, { logLevel: LoggerLevel.Error }),
          { defaultMessage: FAILED_LOGGER_PAYLOAD_MESSAGE },
        );
      }
    },
    async future(
      promiseOrFunction: Promise<never>,
      options?: LoggerInstanceOptions,
    ): Promise<never[] | never | LogItemMessage> {
      // @note: to be function of promise
      const payload = await promiseOrFunction;
      const asyncSerializer: Maybe<EntitySerializer> =
        await mapOptionsToAsyncSerializer(options, loggerInstance);

      const details = (
        asyncSerializer !== void 0 ? await asyncSerializer(payload) : payload
      ) as never | never[];
      return logPayload(details, options);
    },
  };
}
  ;

