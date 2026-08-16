// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { inject, injectable } from 'inversify';
import { LazyServiceIdentifier } from '@inversifyjs/common';

import type { ServiceIdentifier } from '@inversifyjs/common';
import type { BindingScope } from '@inversifyjs/core';


/**
 * Represents a lazy-loaded service instance, where the service identifier is
 * dynamically created using the provided factory function.
 *
 * @template TInstance The type of the service instance.
 * @extends LazyServiceIdentifier<TInstance>
 */
export class PureLazyInstance<TInstance = unknown> extends LazyServiceIdentifier<TInstance> {
  constructor(buildServiceId: () => ServiceIdentifier<TInstance>) {
    super(buildServiceId);
  }
}

/**
 * A decorator function that marks a class as injectable and specifies its binding scope.
 *
 * @param {BindingScope} [scope] - Optional binding scope to set for the injectable class.
 * @return {ClassDecorator} A class decorator that applies the specified binding scope and marks the class as injectable.
 */
export function purable(scope?: BindingScope): ClassDecorator {
  return injectable(scope);
}

/**
 * A decorator that injects a service identifier used for dependency injection.
 *
 * @param buildServiceId - The service identifier to be injected.
 *                         It is used to resolve and provide the corresponding dependency.
 * @return A decorator function that can be used as both a parameter decorator
 *         and a property decorator.
 */
export function pure<T = unknown>(
  buildServiceId: ServiceIdentifier<T>,
): ParameterDecorator & PropertyDecorator {
  const lazyIdentifier = new PureLazyInstance<T>(() => buildServiceId);
  return inject(lazyIdentifier);
}
