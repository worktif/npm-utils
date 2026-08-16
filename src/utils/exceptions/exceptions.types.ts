// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Enum representing various custom error types.
 *
 * This enum defines a collection of error types that can be used
 * to categorize and identify specific application errors.
 *
 * Enumeration Members:
 * - NotFound: Indicates that a requested resource could not be found.
 * - InternalError: Represents an unexpected internal server error.
 * - BadRequest: Represents an error caused by an invalid client request.
 * - UnprocessableEntity: Indicates that the server understands the content type
 *   of the request entity, but was unable to process the instructions.
 * - Unauthorized: Represents an error caused*/
export enum CustomErrorType {
  NotFound = 'NotFoundError',
  InternalError = 'InternalError',
  BadRequest = 'BadRequestError',
  UnprocessableEntity = 'UnprocessableEntityError',
  Unauthorized = 'UnauthorisedError',
  Forbidden = 'ForbiddenError',
}

/**
 * Represents options that can be used to customize a custom error object.
 */
export interface CustomErrorOptions {
  code?: CustomErrorType;
  error?: unknown;
  errorCause?: unknown;
  service?: string;
  module?: string;
  content?: any;
}
