// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { catchInjector } from '@utils/decorators/decorators-injectors';
import { LoggerLevel } from '@utils/logger';

import type { ApiError, Maybe, WithRequestID } from '@utils/common/common.types';
import type { BeforeInstance, DecoratorResponse } from '@utils/decorators/decorators.types';

/**
 * Injects a function as a method decorator.
 * The decorated method will call the injected function before and after executing its original logic.
 *
 * @param {function} injectFunction - The function to be injected as a decorator.
 * @param {function} [injectCatchFunction] - The function to handle catch errors. Default is `catchInjector('Exception is undefined.')`.
 * @returns {MethodDecorator} - The method decorator.
 */
export function injectBefore<T>(
  injectFunction: (this: any, ...args: any[]) => Promise<BeforeInstance>,
  injectCatchFunction: (
    this: any,
    error: ApiError,
    ...args: any[]
  ) => any = catchInjector('Exception (error) is undefined.'),
): MethodDecorator {
  return function methodDecorator<S = DecoratorResponse<T>>(
    target: any,
    propertyKey: string | symbol,
    originalDescriptor: TypedPropertyDescriptor<S>,
  ): Maybe<TypedPropertyDescriptor<S>> {
    const originalMethod: Maybe<S> = originalDescriptor.value!;
    const descriptor: PropertyDescriptor = { ...originalDescriptor };

    if (
      originalMethod &&
      'value' in (originalDescriptor as NonNullable<S> & object)
    ) {
      descriptor.value = async function (...args: any[]) {
        let beforeInstance: BeforeInstance = args.find(
          (arg) => arg && arg.typeDef === 'before_instance',
        );
        if (!beforeInstance) {
          beforeInstance = await injectFunction.apply(this, args);
          args.push(beforeInstance);
        } else {
          const additionalData: BeforeInstance = await injectFunction.apply(
            this,
            args,
          );
          Object.assign(beforeInstance, additionalData);
        }

        if (beforeInstance.log) {
          beforeInstance.log.now(args, {
            message: 'Args:',
            level: LoggerLevel.Debug,
          });
        }

        // console.log({ args });

        // @todo: return the previous version as that's can be invalid
        try {
          const argsWithoutBI = args.filter((arg) => arg?.typeDef !== 'before_instance');
          const result = originalMethod instanceof Function
            ? (originalMethod.apply(this, [...argsWithoutBI, beforeInstance])) as WithRequestID<T>
            : void 0;
          return result instanceof Promise ? await result : result;
        } catch (error: ApiError) {
          console.error('error: ', error);
          await injectCatchFunction.apply(this, [error, ...args]);
          return void 0;
        }
      };
    }

    return descriptor;
  };
}
