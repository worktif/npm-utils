// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { PureTied } from '@core/bundle/pure.container.types';

/**
 * Composes a factory binding for the given name.
 *
 * @param {string} name - The name of the binding.
 * @return {string} - The factory binding for the given name.
 */
export const composeFactoryBind = <T = any>(name: keyof PureTied<T>): string => {
  return `Factory<${name}>`;
};
