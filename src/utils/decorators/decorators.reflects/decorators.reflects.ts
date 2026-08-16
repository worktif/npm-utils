// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Reflect > Auto Param Types
 * @param {any} target The target object for which parameter types will be retrieved
 * @return undefined
 */
export function AutoParamTypes(target: any) {
  // @ts-ignore
  const paramTypes = Reflect.getMetadata('design:paramtypes', target) as any[];
  // @ts-ignore
  Reflect.defineMetadata('paramTypes', paramTypes, target);
}


/**
 * A decorator function that retrieves metadata ('class:name') from the given target
 * and defines new metadata ('className') on the target using the retrieved value.
 *
 * @param {any} target - The target object on which the metadata operations are performed.
 * @return {void} This function does not return a value.
 */
export function MetaClassName(target: any) {
  // @ts-ignore
  const className: string = Reflect.getMetadata('class:name', target) as string;
  // @ts-ignore
  Reflect.defineMetadata('className', className, target);
}
