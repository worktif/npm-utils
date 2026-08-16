// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { StatusCodes } from 'http-status-codes';

import { ApiError, Maybe } from '@utils/common/common.types';
import { BeforeInstance, DecoratorCatchInjector, TypeDef, TypeDefTypes } from '@utils/decorators';
import { LoggerInstance, LoggerLevel } from '@utils/logger/logger.types';
import { extractTypedArg } from '@utils/decorators/decorators.utils';
import { composeApiResponse } from '@utils/common/common';


/**
 * An async function that is used as a catch injector for HttpClient objects.
 *
 * @param {string} [message] - The message to be logged.
 *
 * @param restApi
 *
 *
 * @returns {Promise<BeforeInstance>} - A promise that resolves with a BeforeInstance object.
 *
 * @throws {Error} - Throws an error if the LoggerInstance is undefined.
 */
export function catchInjector(
  message?: Maybe<string> | ((...args: any[]) => Maybe<string>),
  restApi = false,
): DecoratorCatchInjector {
  return async function (
    this: any,
    error: ApiError,
    ...args: any[]
  ): Promise<BeforeInstance> {
    const jsonError = error;
    // @todo: replace extractTypedArg<T - to enum
    const beforeInstance: TypeDef<
      TypeDefTypes.BeforeInstance,
      { log: LoggerInstance }
    > = extractTypedArg<TypeDefTypes.BeforeInstance, { log: LoggerInstance }>(
      TypeDefTypes.BeforeInstance,
      args,
    );
    if (beforeInstance?.log === void 0) {
      // @todo: define the valuable error message
      // throw Error('catchInjector: LoggerInstance is undefined.');
      console.error('jsonError: ', jsonError);
      console.error('jsonError: ', JSON.stringify(jsonError));
    } else {
      beforeInstance.log.now(jsonError, {
        message,
        level: LoggerLevel.Error,
      });
    }

    if (restApi) {
      return {
        ...beforeInstance,
        error: composeApiResponse(
          error.message,
          StatusCodes.UNPROCESSABLE_ENTITY,
        ),
      };
    } else {
      throw error;
    }
  };
}
