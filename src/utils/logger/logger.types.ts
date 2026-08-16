// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Logger } from '@aws-lambda-powertools/logger';

import { ApiError, Maybe } from '@utils/common/common.types';
import { LogItemMessage } from '@aws-lambda-powertools/logger/lib/esm/types';

/**
 * Represents configuration options for logging information.
 *
 * This type allows specifying options to customize the default message
 * used during logging operations.
 *
 * Properties:
 * - defaultMessage: A string representing the default log message.
 */
export type LogInfoOptions = {
  defaultMessage: string;
};

/**
 * Represents a mapping between entity identifiers and their associated serializers.
 * This structure is used to define the serializers for logging specific entities.
 *
 * Each key in the map is the name or identifier of an entity, and the value
 * is an instance of `EntityLoggerSerializer` configured for that entity type.
 *
 * The generic type parameters used by `EntityLoggerSerializer<any, any>` represent:
 * - The input type being serialized.
 * - The output type resulting from the serialization process.
 */
export type EntityLoggerSerializerMap = {
  [mapperEntity: string]: EntityLoggerSerializer<any, any>;
};

/**
 * LoggerInstance is an interface that defines methods for logging
 * events either at the current moment or asynchronously in the future.
 */
export interface LoggerInstance {
  now(payload: any | any[], options?: LoggerInstanceOptions): any[] | any;

  future(
    promiseOrFunction: Promise<unknown>,
    options?: LoggerInstanceOptions,
  ): Promise<never[] | never | LogItemMessage>;
}

/**
 * Enum representing the various logging levels for a logging system.
 * Each level signifies the importance or severity of the log message.
 *
 * - Debug: Represents detailed debugging information, typically used by developers for troubleshooting.
 * - Info: Represents general informational messages that highlight the progress of the application at a high level.
 * - Error: Used for logging error events that might still allow the application to continue running.
 * - Critical: Represents severe error events that will presumably lead the application to abort.
 * - Warn: Indicates potentially harmful situations.
 * - Silent: Disables all logging, suppressing all log messages.
 */
export enum LoggerLevel {
  Debug = 'debug',
  Info = 'info',
  Error = 'error',
  Critical = 'critical',
  Warn = 'warn',
  Silent = 'silent',
}

/**
 * EntitySerializer is a generic type representing a function that transforms a response
 * entity of type `T` into a serialized format of type `S` or a Promise of `S`. This can be
 * used to process or convert entities from one representation to another during data handling.
 *
 * @template T - The type of the input response entity being processed. Defaults to `unknown`.
 * @template S - The type of the output serialized format. Defaults to `unknown`.
 * @param {Maybe<T>} [response] - The input response entity to be serialized. It can be of type `T` or `undefined`.
 * @returns {Maybe<S | Promise<S>>} - The serialized output, which can either be of type `S`, a Promise resolving to `S`, or `undefined`.
 */
export type EntitySerializer<T = unknown, S = unknown> = (
  response?: Maybe<T>,
) => Maybe<S | Promise<S>>;

/**
 * A serializer function type that generates an instance of `EntitySerializer`
 * utilizing a specified logger instance to record or trace operations.
 *
 * @template T - The type of the input entity to be serialized. Defaults to `Maybe<unknown>`.
 * @template S - The type of the output serialized entity. Defaults to `Maybe<unknown>`.
 *
 * @param {Logger | typeof console} loggerInstance - An instance of a logger, either a custom Logger
 * implementation or the native console object, used to log serialization events or errors.
 *
 * @returns {Promise<EntitySerializer<T, S>>} A promise resolving to an `EntitySerializer` instance,
 * capable of serializing input entities of type `T` into serialized outputs of type `S`.
 */
export type EntityLoggerSerializer<T = Maybe<unknown>, S = Maybe<unknown>> = (
  loggerInstance: Logger | typeof console,
) => Promise<EntitySerializer<T, S>>;

/**
 * Represents the options for configuring a logger instance.
 *
 * @template T The type of the serialized output from the `serializer` function.
 *
 * @property {function(params: LogItemMessage): T} serializer
 * A function responsible for serializing log message parameters into
 * the desired format specified by the generic type `T`.
 */
export type LoggerInstanceOptionsParams<T extends string = string> = {
  serializer: <T extends string = string>(params: LogItemMessage) => T
}

/**
 * LoggerInstanceOptions is a type definition that represents optional configuration
 * settings for a logging instance. These settings determine the specifics of what
 * and how information is logged.
 *
 * Properties:
 * - message: Optional. A string or ApiError representing the message to be logged.
 * - level: Optional. Defines the logging level, represented by the LoggerLevel type.
 * - tag: Optional. A string used as a tag to categorize or identify the log entry.
 * - serializer: Optional. A mechanism for serializing entities, which can be
 *   provided as an EntityLoggerSerializer, a Promise resolving to EntitySerializer,
 *   or an EntitySerializer instance.
 */
export type LoggerInstanceOptions<T extends string = string> = {
  message?: string | ApiError;
  level?: LoggerLevel;
  tag?: string;
  params?: LoggerInstanceOptionsParams<T>;
  serializer?:
    | EntityLoggerSerializer
    | Promise<EntitySerializer>
    | EntitySerializer;
};

/**
 * Represents the different log levels that can be used in an application.
 * This type is used to specify the severity or importance of log messages.
 *
 * Available log levels:
 * - 'debug': Used for detailed debugging information.
 * - 'info': Used for general informational messages.
 * - 'warn': Used to indicate potentially harmful situations.
 * - 'error': Used to report error events that might require attention.
 */
export type LogLevelExport = 'debug' | 'info' | 'warn' | 'error';
