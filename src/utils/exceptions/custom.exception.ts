// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { injectable } from 'inversify';

import { CustomErrorOptions, CustomErrorType } from '@utils/exceptions/exceptions.types';

/**
 * CustomException class extends the native JavaScript Error object and provides
 * a structured way to represent application-specific exceptions.
 *
 * This class includes additional metadata such as error codes, services, modules,
 * and error causes to provide more context about an error and its origin for debugging
 * purposes. It also offers static factory methods for creating commonly used exception types.
 */
@injectable()
export class CustomException extends Error {
  /**
   * Represents a specific type of custom error. The value is set to `CustomErrorType.InternalError`,
   * which indicates an internal error type within the system or application.
   * This variable is typically used to classify or identify errors for handling or logging purposes.
   */
  public readonly code: CustomErrorType = CustomErrorType.InternalError;

  /**
   * Represents the name of a service.
   * The variable can either hold a string indicating the name of the service
   * or be undefined if no service is specified or assigned.
   */
  public readonly service: string | undefined;

  /**
   * Represents a module name or identifier.
   *
   * The variable `module` is used to hold the name of a module as a string
   * or can be undefined if no module name or identifier is assigned.
   * It can be utilized in scenarios where dynamically handling or processing
   * module names is required.
   */
  public readonly module: string | undefined;

  /**
   * Represents the underlying cause or reason for an error.
   *
   * This variable is of an unknown type and may hold diverse data depending on the
   * specific error context. It is intended to store supplementary details about
   * an error to help with debugging or analysis.
   */
  private readonly errorCause: unknown;

  /**
   * Represents an error with an unknown or unspecified cause.
   * This variable is used to capture and handle errors where the
   * specific details or type of error are not available.
   *
   * It is essential to use this variable for generic error handling
   * scenarios where detailed information about the error is not required
   * or cannot be determined.
   *
   * Note that relying on an unknown error can lead to challenges in
   * debugging and error tracking.
   *
   * @type {unknown}
   */
  private readonly error: unknown;

  /**
   * Represents a variable that can hold any type of value.
   * The `content` variable is dynamically typed and can store
   * primitives, objects, arrays, functions, or any valid JavaScript value.
   */
  private content: any;

  /**
   * A default error message to display when no specific error message is provided.
   * It indicates that an unexpected error has occurred and suggests the user to try again later.
   */
  defaultMessage: string = 'Unexpected error occurred. Please try again later.';

  /**
   * Constructs a new instance of the CustomError class.
   *
   * @param {string} [message='Something went wrong'] - The error message to be associated with this error instance.
   * @param {CustomErrorOptions} [options={}] - An object containing additional details about the error.
   * @param {string} [options.code] - The specific error code assigned to this error.
   * @param {any} [options.errorCause] - The root cause or additional context of the error.
   * @param {string} [options.service] - The service or component related to the error.
   * @param {string} [options.module] - The module originating the error.
   * @param {any} [options.content] - Additional contextual content or data for the error.
   * @return {CustomError} A new instance of the CustomError class.
   */
  constructor(
    message = 'Unexpected error occurred. Please try again later.',
    options: CustomErrorOptions = {},
  ) {
    super(message);
    this.code = options.code || CustomErrorType.InternalError;
    this.errorCause = options.errorCause;
    this.service = options.service;
    this.module = options.module;
    this.content = options.content;
    this.error = options.error;
  }

  /**
   * Creates and returns a new CustomException instance with the NotFound error type.
   *
   * @param {string} [message='Unexpected error occurred. Please try again later.'] - The error message to include in the exception.
   * @param {Object} [options={}] - An object containing additional error details.
   * @param {string} [options.errorCause] - The specific cause of the error, if available.
   * @param {string} [options.service] - The service in which the error occurred.
   * @param {string} [options.module] - The module in which the error occurred.
   * @return {CustomException} A new instance of CustomException with the NotFound error type.
   */
  static NotFound(
    message = 'Unexpected error occurred. Please try again later.',
    {
      errorCause,
      service,
      module,
    }: Pick<CustomErrorOptions, 'errorCause' | 'service' | 'module'> = {},
  ): CustomException {
    return new CustomException(message, {
      code: CustomErrorType.NotFound,
      errorCause,
      service,
      module,
    });
  }

  /**
   * Creates and returns an instance of a `CustomException` representing an unauthorized error.
   *
   * @param {string} [message='Unauthorised'] - The error message.
   * @param {Object} [options={}] - Additional options for the error.
   * @param {any} [options.errorCause] - The underlying cause of the error.
   * @param {string} [options.service] - The service related to the error.
   * @param {string} [options.module] - The module related to the error.
   * @return {CustomException} A `CustomException` instance representing the unauthorized error.
   */
  static Unauthorised(
    message = 'Unauthorised',
    {
      errorCause,
      service,
      module,
    }: Pick<CustomErrorOptions, 'errorCause' | 'service' | 'module'> = {},
  ): CustomException {
    return new CustomException(message, {
      code: CustomErrorType.Unauthorized,
      errorCause,
      service,
      module,
    });
  }

  /**
   * Generates a custom internal server error exception.
   *
   * @param {string} [message='Internal server error'] - The error message to be associated with the exception.
   * @param {Object} [options={}] - Additional error options to provide more context about the exception.
   * @param {string} [options.errorCause] - The underlying cause or reason for the error.
   * @param {string} [options.service] - The service or subsystem where the error occurred.
   * @param {string} [options.module] - The specific module or component that generated the error.
   * @return {CustomException} A new instance*/
  static InternalError(
    message = 'Internal server error',
    {
      error,
      errorCause,
      service,
      module,
    }: Pick<CustomErrorOptions, 'errorCause' | 'service' | 'module' | 'error'> = {},
  ): CustomException {
    return new CustomException(message, {
      code: CustomErrorType.InternalError,
      errorCause,
      service,
      module,
      error,
    });
  }

  /**
   * Generates a `CustomException` representing a "Bad Request" error.
   *
   * @param {string} [message='Invalid request'] - The error message to be associated with the exception.
   * @param {Object} [options] - Additional options for the error.
   * @param {any} [options.errorCause] - The underlying cause of the error.
   * @param {string} [options.service] - The service in which the error occurred.
   * @param {string} [options.module] - The module where the error originated.
   * @return {CustomException} A new instance of `CustomException` configured as a "Bad Request" error.
   */
  static BadRequest(
    message = 'Invalid request',
    {
      errorCause,
      service,
      module,
    }: Pick<CustomErrorOptions, 'errorCause' | 'service' | 'module'> = {},
  ): CustomException {
    return new CustomException(message, {
      code: CustomErrorType.BadRequest,
      errorCause,
      service,
      module,
    });
  }

  /**
   * Creates and returns a new CustomException instance with the UnprocessableEntity error type.
   *
   * @param {string} [message='Entity is unprocessable'] - The error message to describe the unprocessable entity.
   * @param {Object} [options] - Additional options for the custom error.
   * @param {Error} [options.errorCause] - The underlying error or cause of the unprocessable entity.
   * @param {string} [options.service] - The name of the service where the error originated.
   * @param {string} [options.module] - The name of the module where the error originated.
   * @param {any} [options.content] - Additional contextual information about the error.
   * @return {CustomException} A new instance of CustomException with the UnprocessableEntity error type and specified details.
   */
  static UnprocessableEntity(
    message = 'Entity is unprocessable',
    {
      errorCause,
      service,
      module,
      content,
    }: Pick<
      CustomErrorOptions,
      'errorCause' | 'service' | 'module' | 'content'
    > = {},
  ): CustomException {
    return new CustomException(message, {
      code: CustomErrorType.UnprocessableEntity,
      errorCause,
      service,
      module,
      content,
    });
  }

  /**
   * Retrieves the cause of the error associated with this instance.
   *
   * @return {unknown} The cause of the error. The returned value can be of any type.
   */
  getErrorCause(): unknown {
    return this.errorCause;
  }
}
