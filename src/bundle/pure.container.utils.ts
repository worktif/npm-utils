// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Represents a constructor type definition for creating instances of a class.
 *
 * @template T Specifies the type of the class instance that this constructor creates.
 * @typeParam T The type of the object being constructed. Defaults to `any` if not specified.
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Creates and returns a new instance of the specified class using the provided dependencies.
 *
 * @param {Constructor<T>} Cls - The class or constructor function to instantiate.
 * @param {any[]} deps - An array of dependencies to be passed to the constructor.
 * @return {T} A new instance of the specified class.
 */
export function createInstance<T>(Cls: Constructor<T>, deps: any[]): T {
  return new Cls(...deps);
}

