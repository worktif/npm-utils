// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { catchInjector } from '@utils/decorators/decorators-injectors';
import { DecoratorResponse } from '@utils/decorators/decorators.types';
import { Maybe } from '@utils/common/common.types';


/**
 * Decorator function that injects the provided function after the execution of the decorated method.
 *
 * @param {function} injectFunction - The function to be injected after the decorated method.
 * @param {function} [injectCatchFunction] - The function to be injected in case of an exception.
 *
 * @returns {MethodDecorator} - The decorator function.
 */
export function injectAfter<T>(
  injectFunction: (this: any, ...args: any[]) => void,
  injectCatchFunction: (this: any, ...args: any[]) => void = catchInjector(
    'Exception is undefined.',
  ),
): MethodDecorator {
  return function methodDecorator<S = DecoratorResponse<T>>(
    target: any,
    propertyKey: string | symbol,
    originalDescriptor: TypedPropertyDescriptor<S>,
  ): Maybe<TypedPropertyDescriptor<S>> {
    const originalMethod: Maybe<S> = originalDescriptor.value;
    const descriptor: PropertyDescriptor = { ...originalDescriptor };

    if (
      originalMethod &&
      'value' in (originalDescriptor as NonNullable<S> & object)
    ) {
      descriptor.value = async function (...args: any[]) {
        try {
          const response: any =
            originalMethod instanceof Function
              ? await originalMethod.apply(this, args)
              : void 0;
          return injectFunction.apply(this, [response]); // @note: eventChainManager will handle positive
        } catch (error: any) {
          injectCatchFunction.apply(this, [error, ...args]);
          return void 0;
        }
      };
    }
    return descriptor;
  };
}
