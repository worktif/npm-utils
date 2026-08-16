// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { Container } from 'inversify';
import { BindWhenOnFluentSyntax, Factory, ResolutionContext } from 'inversify/lib/esm';

import { composeFactoryBind, Di } from '@utils/di';

import { PureStackArgs, PureTied, PureTiedOptions } from './pure.container.types';
import { Maybe } from '@utils/common/common.types';
import { CustomException } from '@utils/exceptions';
import { Constructor } from 'src/bundle/pure.container.utils';
import { error } from '@utils/common';
import identity from 'lodash/identity';


/**
 * The `PureContainer` class extends the `Container` class and provides functionality
 * to manage and track its initialization state. It ensures that consumers can verify
 * or wait until the container is fully initialized.
 */
export class PureContainer<T extends PropertyKey = string> extends Container {
  /**
   * A boolean flag indicating whether the required initialization has been completed.
   * The value is set to `false` by default and should be updated to `true`
   * once the initialization process is successfully executed.
   */
  private _isInitialized = false;


  /**
   * The `tied` variable is an instance of `PureTied`, which is parameterized with `any` type,
   * extending the structure defined by `PureTieInstance`.
   *
   * This variable serves as a storage for reactive bindings, typically in scenarios that require
   * dynamic state management or data observation patterns. It allows for efficient two-way data
   * binding between models and views.
   *
   * `PureTied` provides mechanisms for tracking changes, ensuring any updates to the tied
   * data structure are propagated automatically to the subscribed elements or components.
   *
   * Usage of this variable should take into consideration the restriction to adhere to or
   * extend the `PureTieInstance` interface, which defines the contract for the tied instances.
   *
   * @todo: extend by PureTieInstance
   */
  public tied: Maybe<PureTied<T>>;

  /**
   * Executes a factory method with the given dependency name and arguments, returning the constructed instance.
   *
   * @param {Di} name - The dependency identifier to locate the associated factory.
   * @param {...any} args - The arguments to pass to the factory function.
   * @return {T} The instance created by the factory method.
   *
   * @note: run – means DI composition instead of
   *        get - the default Singleton instance
   */
  public run<T>(name: keyof PureTied<T>, ...args: any): T {
    return this.get<Factory<T>>(
      composeFactoryBind(name),
    )(...args) as T;
  }

  /**
   * Executes a constant operation based on the provided name and arguments.
   *
   * @param {keyof PureTied<T>} name - The key of the constant operation to run.
   * @param {...any} args - Additional arguments for the operation.
   * @return {T} The result of the executed constant operation.
   */
  public runConstant<T>(name: keyof PureTied<T>, ...args: any): T {
    return this.get<T>(name) as T;
  }


  /**
   * Binds and configures the provided options to the current instance.
   * Creates a "tied" object by mapping each option key to a bound instance.
   *
   * @param {PureTiedOptions<any>} options - An object representing the dependencies to bind and their configurations.
   * @param {...any} args - Additional arguments that may be required for binding logic (currently unused).
   * @return {void} This method does not return a value but updates the tied object of the instance.
   *
   * @example
   * ```typescript
   * this.tie({
   *   [ServicesA.Logger]: new LoggerService(),
   *   [ServicesA.Storage]: new StorageService(),
   *   [ServicesB.Auth]: new AuthService(),
   *   [ServicesB.Metrics]: new MetricsService(),
   * });
   * ```
   */
  public tieSingleton(options: PureTiedOptions<any, T>, ...args: any): void {
    this.tied = {
      ...this.tied,
      ...Object.fromEntries<any>(
        Object
          .entries(options)
          .map(([name, instance]: [string, any]) => {
            return [
              name,
              this.bind(name)
                .to(instance)
                .inSingletonScope()];
          }),
      ),
    } as PureTied<T>;
  }

  /**
   * Binds the constants provided in the `options` parameter to the instance's configuration, allowing
   * dependencies and values to be organized under specified names.
   *
   * @param {PureTiedOptions<any, T>} options - An object containing configuration for the constants. Each entry
   * includes a name, instance, arguments, and dependencies used for the binding.
   * @param {...any} args - Additional arguments that may be used when processing the provided options.
   * @return {void} This method does not return a value as it modifies the internal `tied` property of the instance.
   */
  public tieConst(options: PureTiedOptions<any, T>, ...args: any): void {
    const proto: Maybe<any> = Object.getPrototypeOf(Object.getPrototypeOf(this));
    if (proto && 'tied' in proto && 'tieConst' in proto) {
      proto.tieConst(options, ...args);
    }

    const tied = {
      ...Object
        .entries(options)
        .reduce((tiedAccumulated: Maybe<PureTied<any>>, [name, { instance, args, dependencies }]: [string, any]) => {
          const { value, condition = identity }: PureStackArgs = args[0];
          const constInst = this.bind(name)
            .toConstantValue(condition(value));
          return {
            ...tiedAccumulated,
            [name]: {
              instance: constInst,
              args,
              dependencies,
            }
          };
        }, proto && 'tied' in proto ? { ...proto.tied, ...this.tied  } : this.tied)
    }

    this.tied = {
      ...this.tied,
      ...tied,
    };

    // const tied = {
    //   ...Object.fromEntries<any>(
    //     Object
    //       .entries(options)
    //       .map(([name, { instance, args, dependencies }]: [string, any]) => {
    //         return [
    //           name,
    //           this.bind(name)
    //             .toConstantValue(args[0].value)
    //           ];
    //       }),
    //   ),
    // } as PureTied<T>;
  }


  /**
   * Binds the given options and additional arguments to the current instance.
   *
   * @param {PureTiedOptions<TT, T>} options - An object containing the bindings, where the keys represent names, and the values contain configuration for instances and dependencies.
   * @param {...any} args - Additional arguments to be passed during binding, if necessary.
   * @return {void} This method does not return a value but sets up the specified bindings.
   */
  public tie(options: PureTiedOptions<any, T>, ...args: any): void {
    const proto: Maybe<any> = Object.getPrototypeOf(Object.getPrototypeOf(this));

    if (proto && 'tied' in proto && 'tieConst' in proto) {
      proto.tie(options, ...args);
    }

    const tied = {
      ...Object
        .entries(options)
        .reduce((tiedAccumulated: Maybe<PureTied<any>>, [name, { instance, args, dependencies }]: [string, any]) => {
          const depInstance: BindWhenOnFluentSyntax<Factory<any>> = this.bind<Factory<typeof instance>>(composeFactoryBind(name))
            .toFactory((context: ResolutionContext) => {
              return () => {

                let optionalArgs: any[] = [];
                if (args) {
                  try {
                    optionalArgs = args.map(({ value, condition = identity }: PureStackArgs) => condition(value));
                  } catch (e) {
                    throw CustomException.InternalError(`
                      Pure Container Exception by invalid arguments, ${JSON.stringify(dependencies)}: ${typeof instance}.
                      Exception message: ${error(e)}
                    `, {
                      error: e,
                    });
                  }
                }

                let deps: any[] = [];
                try {
                  deps = dependencies.map((dep: string) => {
                    const inst: Maybe<any> = tiedAccumulated ? tiedAccumulated[dep].instance : void 0;
                    return context.get<Factory<typeof inst>>(composeFactoryBind(dep))() as typeof inst;
                    // const inst: Maybe<string> = Object.keys(previousTied).find((keyInst: string) => keyInst === dep);
                  });
                } catch (e) {
                  throw CustomException.InternalError(`
                    Pure Container Exception by invalid dependencies, ${JSON.stringify(dependencies)}: ${typeof instance}.
                    Exception message: ${error(e)}
                  `, {
                    error: e,
                  });
                }

                try {
                  // @todo: set rule: optional args are the first instance args, deps are the second args
                  const instanceArgs: any[] = [...optionalArgs, ...deps];
                  return new (instance as Constructor<any>)(...instanceArgs);
                } catch (e) {
                  throw CustomException.InternalError(
                    `Pure Container Exception: ${typeof instance}.
                    Instance: ${name}
                  `, {
                      error: e,
                    });
                }
              };
            });
          // Object.assign(tiedAccumulated ?? {}, {
          //   [name]: {
          //     instance: depInstance,
          //     args,
          //     dependencies,
          //   }
          // });
          return {
            ...tiedAccumulated,
            [name]: {
              instance: depInstance,
              args,
              dependencies,
            }
          };
        }, proto && 'tied' in proto ? { ...proto.tied, ...this.tied  } : this.tied)
    };

    this.tied = {
      ...this.tied,
      ...tied,
    };
  }

  /**
   * Sets an argument with a specified value and condition.
   *
   * @template T The type of the value being set.
   * @param {T} value The value to be assigned.
   * @param {(v: T) => boolean} condition A function that evaluates the provided value and returns a boolean.
   * @return {{ value: T, condition: () => boolean }} An object containing the value and a function to evaluate the condition.
   */
  protected setArg<T>(value: T, condition: (v: T) => Maybe<T>) {
    return {
      value,
      condition: () => condition(value),
    };
  }

  /**
   * Merges the current tied object with the provided nextTied object.
   *
   * @param {any} nextTied - The object to merge with the current tied object.
   * @return {any} A new object resulting from merging the current tied object and nextTied object.
   */
  public merge(nextTied: PureTied<any>): any {
    return {
      ...this.tied,
      ...nextTied,
    } as const;
  }

  // /**
  //  * Checks if the object is ready and initialized.
  //  *
  //  * @return {boolean} Returns true if the object is initialized, otherwise false.
  //  *
  //  * @deprecated
  //  */
  // get isReady(): boolean {
  //   return this._isInitialized;
  // }
  //
  // /**
  //  * Marks the current instance as initialized and ready to use by setting an internal flag.
  //  *
  //  * @return {void} Indicates the method does not return a value.
  //  *
  //  * @deprecated
  //  */
  // public markReady(): void {
  //   this._isInitialized = true;
  // }
  //
  // /**
  //  * Waits until the instance is fully initialized and ready for use.
  //  * Executes a loop that checks the `_isInitialized` property and resolves when the condition is met.
  //  *
  //  * @return {Promise<void>} A promise that resolves once the instance is ready.
  //  *
  //  * @deprecated
  //  */
  // public async waitUntilReady(): Promise<void> {
  //   // while (!this._isInitialized) {
  //   await new Promise((res) => setTimeout(res, 5));
  //   // }
  // }
}
