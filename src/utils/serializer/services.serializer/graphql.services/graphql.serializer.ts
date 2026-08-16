// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { injectable } from 'inversify';

import { Logger } from '@aws-lambda-powertools/logger';

import { logger, RuntimeLogFormatterProvider, RuntimeLoggerFormatter } from '@utils/logger';
import { LoggerInterface } from '@utils/structure';
import { ApiSerializer } from '@utils/serializer';


/**
 * A utility type that recursively transforms all `undefined` fields in a GraphQL
 * type into `null`. This is particularly useful for ensuring compatibility with
 * GraphQL APIs that may return `null` in place of `undefined` for optional fields.
 *
 * - If a field's value is `undefined`, it will be replaced with `null`.
 * - If a field is an array, the type is recursively applied to the elements of the array.
 * - If a field is an object, the type is recursively applied to the object.
 *
 * @template T The input type to transform.
 */
export type GqlToNull<T> = {
  [K in keyof T]: T[K] extends undefined
  ? null
  : T[K] extends (infer U)[]
  ? GqlToNull<U>[]
  : T[K] extends object
  ? GqlToNull<T[K]>
  : T[K];
};

/**
 * A TypeScript utility type that transforms the properties of a GraphQL result type into a structure
 * where `null` values are replaced with `void`. If a property is an object, the transformation is applied
 * recursively. For array types, the transformation is applied to each item in the array.
 *
 * This type is useful for scenarios where a GraphQL result needs special handling to map `null` values
 * or nested object structures.
 *
 * Type parameters:
 * - `T`: The original GraphQL result type to transform.
 *
 * Mappings:
 * - If a property is `null`, it is replaced with `void`.
 * - If a property is an array, the transformation is applied to each element of the array.
 * - If a property is an object, the transformation is applied recursively.
 * - Other types remain unchanged.
 */
export type GqlToVoid<T> = {
  [K in keyof T]: T[K] extends null
  ? void
  : T[K] extends (infer U)[]
  ? GqlToNull<U>[]
  : T[K] extends object
  ? GqlToNull<T[K]>
  : T[K];
};

/**
 * A serializer class for handling GraphQL-specific serialization. This class extends the base functionality
 * of ApiSerializer and implements the LoggerInterface for logging capabilities. It provides functionality
 * to manage GraphQL serialization requirements while ensuring logging integration through a logger instance.
 *
 * This class utilizes a logger instance specific to the service it belongs to. The logger captures and logs
 * events related to the GraphQL serialization service.
 *
 * Key features:
 * - Extends the base functionality of ApiSerializer.
 * - Implements a custom logger instance for capturing logs specific to the GraphQL serialization service.
 * - Provides the foundational structure for GraphQL serialization within the application.
 *
 * Implements:
 * - LoggerInterface - to ensure necessary logging functionalities are available within the serializer.
 *
 * Extends:
 * - ApiSerializer - to enhance or override base serialization functionalities to fit GraphQL-specific use cases.
 */
@injectable()
export class GraphqlSerializer extends ApiSerializer implements LoggerInterface {
  loggerInstance: Logger = logger({
    serviceName: '@utils/serializer/services.serializer/graphql.services/graphql.serializer.ts',
    logFormatter: new RuntimeLoggerFormatter({
      logsProvider: RuntimeLogFormatterProvider.RichConsole,
    }) as any,
  });

  /**
   * Initializes a new instance of the class and calls the constructor of the parent class.
   *
   * @return {Object} A new instance of the class.
   */
  constructor() {
    super();
  }
}
