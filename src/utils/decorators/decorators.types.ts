// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';
import { LoggerInstance } from '@utils/logger/logger.types';
import { ApiError } from '@utils/common/common.types';

/**
 * Represents the type definition sign.
 *
 * @typedef {'typedef'} TypeDefPrefix
 */
export type TypeDefPrefix = 'typedef';

/**
 * Represents a typedef sign.
 *
 * @typedef {string} TypeDefSign
 */
export const TYPE_DEF_PREFIX: TypeDefPrefix = 'typedef';

/**
 * Represents a type definition with additional properties.
 *
 * @template D - The type of the type definition.
 * @template T - The type of additional properties.
 */
export type TypeDef<D extends string, T> = {
  typeDef: `${TypeDefPrefix}_${D}`;
} & T;

/**
 * Enumeration for various types of type definitions.
 */
export enum TypeDefTypes {
  BeforeInstance = 'before_instance',
}


/**
 * Represents a decorator response, which is a type that combines two types.
 *
 * @template T - The type that will be combined with an object.
 */
export type DecoratorResponse<T> = T & object;

/**
 * A type definition that is structured using `TypeDef` to describe a configuration object
 * which includes a logging instance and an optional error property.
 *
 * This type encapsulates the properties required for initial setup or state configuration
 * before a main instance is created within the application context.
 *
 * Properties:
 * - `log`: A required `LoggerInstance` used for logging events or diagnostics.
 * - `error`: An optional field allowing the attachment of error information, which can
 *   be utilized for handling errors during the setup process.
 *
 * Typically utilized in scenarios where pre-instance initialization relies on logging
 * and error handling mechanisms.
 */
export type BeforeInstance = TypeDef<
  TypeDefTypes,
  {
    log: LoggerInstance;
    error?: any;
  }
>;

/**
 * Represents a decorator function that injects catch logic into a class method.
 * @param {HttpClient<any>} this - The HttpClient instance.
 * @param {ApiError} error - The error object to be caught.
 * @param {...any} args - Additional arguments that can be passed to the method.
 * @returns {Promise<BeforeInstance>} Promise that resolves with the modified instance.
 */
export type DecoratorCatchInjector = (
  this: any, // @todo: create empty interface
  error: ApiError,
  ...args: any[]
) => Promise<BeforeInstance>;




