// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { z } from 'zod';

import { envConfigSchemaDefault, envConfigSchemaSupport } from '@core/config/env.config.default';

/**
 * Defines a type for environment schema descriptor values.
 *
 * This type represents an object where each key is a string and its associated value is also a string.
 * It can be utilized to describe environment variables or configuration settings as key-value pairs.
 */
export type EnvSchemaDescriptorValues = { [key: string]: string; };

/**
 * The `EnvSchemaDescriptor` type is a structure used to define the schema and values for environment-based validation.
 * It is composed of an object that specifies the environment values and their corresponding schema validation rules.
 *
 * Properties:
 * - `env`: Represents the environment variables or configuration values.
 * - `schema`: Defines the schema validation rules for the environment values using Zod types.
 */
export type EnvSchemaDescriptor = {
  env: EnvSchemaDescriptorValues;
  schema: z.ZodType<EnvSchemaDescriptorValues>;
}


/**
 * EnvConfigSchema is a TypeScript type derived using the `z.infer` utility from the `envConfigSchema` schema.
 * It represents the expected structure and type of an environment configuration object as defined in the Zod schema.
 *
 * This type is used to ensure that objects adhere to the predefined structure and validation rules
 * specified in the `envConfigSchema`. It helps enforce type safety and prevent runtime errors
 * related to incorrect environment configurations.
 *
 * Developers can utilize this type to define strict contracts for working with configuration data
 * throughout the codebase.
 */
export type EnvConfigSchemaDefault = z.infer<typeof envConfigSchemaDefault> | z.infer<typeof envConfigSchemaSupport>;
