// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { EnvConfigDefault } from '@core/config/env.config.default';

import { LoggerCliPlugin, LoggerCliPluginExt } from '@utils/logger/plugins';

/**
 * Enumeration for Dependency Injection bindings.
 * @enum {string}
 */
export const enum Di {
  EnvConfigDefaultBind = 'env_config_default_bind',
  SerializerFactoryBind = 'serializer_factory_bind',
  ApiSerializerBind = 'api_serializer_bind',
  GraphqlSerializerBind = 'graphql_serializer_bind',

  LoggerFormatter = 'logger_formatter_factory_bind',
  LoggerRuntimeFormatter = 'logger_runtime_formatter_factory_bind',
  LoggerRuntimeFormatter_Local = 'logger_runtime_formatter_local_factory_bind',
  LoggerRuntimeFormatter_Local_Shortened = 'logger_runtime_formatter_local_shortened_factory_bind',
  LoggerRuntimeFormatter_Aws = 'logger_runtime_formatter_aws_factory_bind',

  LoggerCli_plugin = 'loggerCli_plugin',
  LoggerCli_plugin_ext = 'loggerCli_plugin_ext',
}

/**
 * Represents a Dependency Injection instance with bindings for various services and entities.
 * // More properties representing various service and entity bindings...
 */
export type DiInstance = {
  [Di.EnvConfigDefaultBind]: EnvConfigDefault;
  [Di.LoggerCli_plugin]: LoggerCliPlugin;
  [Di.LoggerCli_plugin_ext]: LoggerCliPluginExt;
};

