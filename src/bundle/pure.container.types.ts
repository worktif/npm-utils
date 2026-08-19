// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { BindWhenOnFluentSyntax, Factory } from 'inversify/lib/esm';

import { Di } from '@utils/di';
import { Maybe } from '@utils/common/common.types';

/**
 * Represents a constructable type that can be instantiated with the `new` keyword.
 *
 * @template TInstance The type of the instance that will be created.
 * @template TArgs The types of the arguments passed to the constructor.
 */
export type Newable<TInstance = unknown, TArgs extends unknown[] = any[]> = new (...args: TArgs) => TInstance;

/**
 * Represents the options for tying a container to a specific instance type.
 *
 * @template T The type of the instance being tied to the container.
 * @typedef {Object} ContainerTieOptions
 * @property {Di} name The identifier for the container instance.
 * @property {Newable<T>} instance The constructor for the instance type being tied.
 */
export type ContainerTieOptions<T> = {
  name: Di;
  target: Newable<T>,
}

/**
 * A type definition for `PureTied` that represents an object with keys being either
 * a `Di` object or a string, and values conforming to the `BindWhenOnFluentSyntax<T>` type.
 *
 * @template T - The generic type parameter used in the `BindWhenOnFluentSyntax` values.
 * @typedef {Object} PureTied
 * @property {BindWhenOnFluentSyntax<T>} [key] - A dynamic key of type `Di` or `string`,
 **/
export type PureTied<T, S extends PropertyKey = string> = {
  [K in S]: PureStack<BindWhenOnFluentSyntax<Factory<T> | T>>
};

/**
 * Represents arguments for a stack operation with pure behavior, which includes a value and a condition function.
 *
 * @typedef {Object} PureStackArgs
 * @property {Maybe<any>} value - An optional value to be processed or utilized in the stack.
 * @property {function(): any} condition - A callback function representing a condition or operation.
 */
export type PureStackArgs = {
  value: Maybe<any>,
  condition?: (value: Maybe<any>) => any,
};

/**
 * Represents a PureStack object that encapsulates an instance of type T and a list of dependency indicators.
 *
 * @template T - The type of the instance.
 * @property {T} instance - The main instance held within the PureStack.
 * @property {string[]} dependencies - A list of dependency indicators, such as strings or enums, that describe the dependencies associated with the instance.
 */
export type PureStack<T> = {
  target: T, // @todo: check Newable is related or not
  deps: string[], // Dependency Injection indicator string values. Example: Di, PurewsDi enums
  args?: PureStackArgs[],
}

/**
 * A type definition for `PureTiedOptions` that maps keys to generic type values.
 *
 * This type associates keys, which can be any string or a `Di` type, with values of a specified generic type `T`.
 *
 * @template T - The type of values in the mapped structure.
 */
export type PureTiedOptions<T, S extends PropertyKey = string> = {
  [K in S]: PureStack<T>;
};


/**
 * A TypeScript type alias representing a class-like type that can be instantiated.
 * The `PureTie` type is used to enforce that the generic type parameter `T`
 * corresponds to an instantiable class (constructor function).
 *
 * This allows developers to ensure that objects conforming to the `PureTie` type
 * have a valid constructor capable of constructing instances of type `T`.
 *
 * @template T - The type of the object that the class will construct.
 */
export type PureTie<T extends PropertyKey = string> = Newable<T>
