// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';
import { BeforeInstance, TypeDef, TypeDefTypes } from '@utils/decorators/decorators.types';

/**
 * Extracts a typed argument from the given array of arguments based on the provided type definition.
 *
 * @param {T} typeDef - The type definition to match against.
 * @param {...any[]} args - The array of arguments to search.
 * @return {TypeDef<T, S>} - The first argument that matches the type definition, or undefined if no match is found.
 */
export function extractTypedArg<T extends string, S>(
  typeDef: T,
  ...args: any[]
): TypeDef<T, S> {
  // return args.find(
  //   (arg: any) => 'typeDef' in arg && arg.typeDef === `${TYPE_DEF_PREFIX}_${typeDef}`,
  // );
  return args[0].find((arg: any) => arg && arg.typeDef === typeDef);
}

/**
 * Composes a BeforeInstance TypeDef.
 *
 * @param {any} instance - The instance to be composed.
 * @returns {TypeDef<TypeDefTypes.BeforeInstance, BeforeInstance>} - The composed BeforeInstance TypeDef.
 */
export const composeBeforeInstance = (
  instance: any,
): TypeDef<TypeDefTypes.BeforeInstance, BeforeInstance> => {
  return composeTypeDef(TypeDefTypes.BeforeInstance, instance);
};

/**
 * Represents a composed type definition.
 *
 * @param {TypeDefTypes} typeDef - The type definition.
 * @param {any} instance - The instance of the type.
 * @returns {TypeDef<TypeDefTypes, any>} A composed type definition.
 */
export const composeTypeDef = (
  typeDef: TypeDefTypes,
  instance: any,
): TypeDef<TypeDefTypes, any> => {
  return {
    typeDef,
    ...instance,
  };
};

