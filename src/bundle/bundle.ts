// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { EnvConfigDefault } from '@core/config/env.config.default';

import { LoggerCliPlugin, LoggerCliPluginExt } from '@utils/logger/plugins';
import { Di } from '@utils/di';
import { ApiSerializer, Serializer } from '@utils/serializer';
import { Maybe } from '@utils/common/common.types';

import { PureContainer } from './pure.container';
import { BundleCli } from './bundle.types';
import { RuntimeLogFormatterProvider, RuntimeLoggerFormatter } from '@utils/logger';
import { PureTiedOptions } from '@core/bundle/pure.container.types';


/**
 * A core class that handles dependency injection and configuration management for the application.
 *
 * The Bundle class serves as a central configuration and dependency management hub, providing:
 * - Dependency injection container management
 * - Environment configuration access
 * - CLI logging capabilities
 *
 * @example
 * ```typescript
 * const bundle = new Bundle();
 * const envConfig = bundle.env;
 * const cliLogger = bundle.cli.logger;
 * ```
 *
 * @remarks
 * This class is designed to be instantiated once and used throughout the application
 * lifecycle. It manages singleton instances of core services and configuration.
 */
export class Bundle {

  /**
   * @class Container
   *
   * @classdesc
   * The Container class represents a variable container, which can hold, retrieve, and modify values of any type.
   * It allows storing key-value pairs, similar to a dictionary or associative array, where the keys are strings
   * representing variable names and the values are the corresponding values.
   *
   * @constructor
   * Creates a new Container object.
   */
  protected container: PureContainer = new PureContainer({ defaultScope: 'Singleton' });

  /**
   * A collection structure represented as an object where the keys are of type string
   * and the values can be of any type wrapped in a Maybe structure.
   *
   * The `#stack` variable is intended to function as a lookup or mapping storage,
   * where each key represents a unique identifier and its corresponding value
   * may or may not exist, depending on the Maybe wrapper.
   *
   * Type:
   * { [key: string]: Maybe<any> }
   */
  protected stack: { [key: string]: Maybe<any> } = {};

  /**
   * Represents an object where each key is a string and its value is potentially
   * a Promise that resolves to any value, or undefined.
   *
   * This structure can be used to store asynchronous computations or results
   * associated with specific keys.
   */
  protected lambda: { [key: string]: Maybe<Promise<any>> } = {};

  /**
   * Indicates whether a specific feature or functionality is supported.
   *
   * This variable is a boolean that determines the presence or absence
   * of support for a given feature. Its value is `true` if the feature
   * is supported and `false` otherwise.
   *
   * @note:@important: This option is related to temporary optional AWS Credentials
   */
  protected support?: boolean;

  /**
   * Initializes a new instance of the Bundle class.
   *
   * During initialization, this constructor:
   * 1. Sets up the dependency injection container
   * 2. Loads environment configuration
   * 3. Initializes the CLI logger plugin
   *
   * @throws {Error} If required dependencies cannot be resolved
   * @constructor
   */
  constructor(support: boolean = false) {
    this.run();
    this.support = support ?? false;
  }

  /**
   * Executes the necessary operations in sequence to run the process.
   * This method handles the injection of the container and triggers the container's execution.
   *
   * @return {void} Does not return a value.
   */
  protected run(): void {
    this.injectContainer();
    this.runContainer();
  }

  /**
   * Executes the container by iterating over its tied configurations and initializing instances.
   * Populates the internal stack with the result of each instance execution.
   *
   * @return {void} No value is returned by this method.
   */
  protected runContainer(): void {
    if (this.container.tied) {
      Object.keys(this.container.tied).forEach((instanceKey: string) => {
        // @todo: check is !this.stack[instanceKey] redefinition practice necessary

        if (!instanceKey.endsWith('_const_bind')) { // @note: run for constants should be excluded
          this.stack[instanceKey] = this.container.run<any>(instanceKey);
        } else {
          this.stack[instanceKey] = this.container.runConstant<any>(instanceKey);
        }
      });
    }
  }

  /**
   * Binds lambda handlers to specific instance keys within the container,
   * associating them using camel-cased names for better readability
   * and accessibility.
   *
   * If the container has tied lambdas, this method iterates through them,
   * retrieves the corresponding handler for each instance key from the
   * internal stack, and binds it to the proper function under the #lambda
   * property using camel-cased naming conventions.
   *
   * @return {void} This method does not return a value.
   */
  protected tieLambdas(): void {
    // @note: We expect to deliver Lambdas naming for an internal/external framework, readable helpful naming, class bundle function relation
    if (this.container.tied) {
      Object.keys(this.container.tied).forEach((instanceKey: string) => {
        if (this.isLambdaInstance(instanceKey)) {
          const lambdaHandler = this.stack[instanceKey];
          this.lambda[instanceKey] = lambdaHandler.handler.bind(lambdaHandler); // @note:@important: Lambda MUST have `handler` method by Interface

          // @todo: check if upper code does not work, apply the bottom.
          //        Reason is this class option argumentation – can be a solution.
          // this.tmpLambdaHandler = this.stack[instanceKey];
          // this.lambda[instanceKey] = this.tmpLambdaHandler.handler.bind(this.tmpLambdaHandler); // @note:@important: Lambda MUST have `handler` method by Interface
        }
      });
    }
  }

  /**
   * Provides access to CLI-related functionality, including logging capabilities.
   *
   * @returns {BundleCli} An object containing CLI utilities and logger instance
   * @example
   * ```typescript
   * const bundle = new Bundle();
   * bundle.cli.logger.info('Application started');
   * ```
   */
  get cli(): BundleCli {
    return {
      logger: this.stack[Di.LoggerCli_plugin],
      loggerFormatter: {
        local: this.stack[Di.LoggerRuntimeFormatter_Local],
        shortened: this.stack[Di.LoggerRuntimeFormatter_Local_Shortened],
        aws: this.stack[Di.LoggerRuntimeFormatter_Aws],
      },
    };
  }

  /**
   * Provides access to the environment configuration.
   *
   * @returns {EnvConfigDefault} The current environment configuration instance
   * @example
   * ```typescript
   * const bundle = new Bundle();
   * const stage = bundle.env.bundle.stage;
   * ```
   */
  get env() {
    return this.stack[Di.EnvConfigDefaultBind];
  }

  /**
   * Configures the dependency injection container with required bindings.
   *
   * This method:
   * 1. Binds environment configuration
   * 2. Sets up factory for CLI logger plugin
   * 3. Configures dependencies for logger plugin
   *
   * @private
   * @returns {void}
   * @throws {Error} If binding configuration fails
   */
  protected injectContainer() {
    const containers: PureTiedOptions<any, any> = { // @todo: the initial instance should already be defined, otherwise we run tie but we have no nay instance to bind
      [Di.EnvConfigDefaultBind]: {
        target: EnvConfigDefault,
        args: [{
          value: this.support ?? false,
          condition: (support: boolean) => support,
        }],
        deps: [],
      },
      [Di.ApiSerializerBind]: {
        target: ApiSerializer,
        deps: [],
      },
      [Di.LoggerCli_plugin_ext]: {
        target: LoggerCliPluginExt,
        deps: [],
      },
      [Di.LoggerCli_plugin]: {
        target: LoggerCliPlugin,
        deps: [Di.EnvConfigDefaultBind, Di.LoggerCli_plugin_ext],
      },
      [Di.SerializerFactoryBind]: {
        target: Serializer,
        deps: [Di.ApiSerializerBind],
      },
      [Di.LoggerRuntimeFormatter_Local]: {
        target: RuntimeLoggerFormatter,
        args: [{
          value: {
            logsProvider: RuntimeLogFormatterProvider.Local,
          },
        }],
        deps: [],
      },
      [Di.LoggerRuntimeFormatter_Local_Shortened]: {
        target: RuntimeLoggerFormatter,
        args: [{
          value: {
            logsProvider: RuntimeLogFormatterProvider.Local,
            isShortened: true,
          },
        }],
        deps: [],
      },
      [Di.LoggerRuntimeFormatter_Aws]: {
        target: RuntimeLoggerFormatter,
        args: [{
          value: {
            logsProvider: RuntimeLogFormatterProvider.Aws,
          },
        }],
        deps: [],
      },
    };
    // @todo: replace internal arguments to a method args, so that, we expect to tie & run at the same time
    //        This approach reduces call methods duplicates, internal reliability
    this.container.tie(containers);

    // Object.keys(containers).map((instanceKey: string) => {
    //   this.container.run(instanceKey);
    // });
  }

  /**
   * Converts a string from lambda_case format to camelCase or PascalCase.
   *
   * @param {string} raw - The input string in lambda_case format to be converted.
   * @param {boolean} [pascalCase=true] - If true, converts to PascalCase; if false, converts to camelCase.
   * @return {string} The formatted string in camelCase or PascalCase.
   */
  protected lambdaToCamelName(raw: string, pascalCase = true): string {
    const words = raw
      .replace(/^lambda_/, '') // @todo: replace to specification, replace to external class variables
      .replace(/_factory_bind$/, '') // @todo: replace to specification, replace to external class variables
      .split('_');

    return words
      .map((word, i) => {
        if (!pascalCase && i === 0) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  /**
   * Determines whether the provided instance key corresponds to a lambda instance.
   *
   * @param {string} instanceKey - The key of the instance to be checked.
   * @return {boolean} Returns true if the instance key format indicates a lambda instance, otherwise false.
   */
  protected isLambdaInstance(instanceKey: string): boolean {
    return instanceKey.startsWith('lambda_') && instanceKey.endsWith('_factory_bind')
  }
}

/**
 * Represents an instance of a Bundle.
 *
 * A `Bundle` is typically used to contain and manage a collection of resources, objects,
 * or functionalities packaged together for a specific purpose within the application.
 * It can act as a modular container, providing encapsulation and organizational structure.
 *
 * This variable holds a new instance of the Bundle class, ready for customization
 * or further configuration as required by the business logic.
 */
export const bundle: Bundle = new Bundle();
