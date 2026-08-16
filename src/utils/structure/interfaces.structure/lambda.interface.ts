// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Interface representing a handler for processing events in a lambda-like environment.
 *
 * @template Event - The type of the event that will be passed to the handler.
 * @template Res - The type of the result that the handler will return. Defaults to `void`.
 * @template Context - The type of the context information passed to the handler. Defaults to `any`.
 */
export interface LambdaHandlerInterface<Event extends object, Res = void, Context = any> {

  /**
   * Handles the specified event and processes it with the given context and additional arguments.
   *
   * @param {Event} event - The event to be handled.
   * @param {Context} context - The context in which the event is being processed.
   * @param {...any} args - Additional arguments to be used during processing.
   * @return {Promise<Res>} A promise that resolves with the result of the handling process.
   */
  handler(event: Event, context: Context, ...args: any): Promise<Res>;
}
