// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

/**
 * External-consumer fixture: a realistic Lambda-like handler.
 *
 * Spec: library-test-coverage — Task 7.1 (e2e scaffolding).
 *
 * This module models how a downstream service consumes the PUBLISHED package. It
 * therefore imports EXCLUSIVELY from the package name `@worktif/utils` — never from
 * `src/`, never via the `@core/*` / `@utils/*` repository path aliases. Under the
 * Jest `e2e` project the specifier resolves to the BUILT artifact (`dist/bundle.js`
 * at runtime, `dist/src/index.d.ts` for types), exactly as `npm install` would wire
 * it for a real consumer.
 *
 * The handler exercises the three public flows the e2e scenario (tasks 7.2/7.3) will
 * assert against: structured logging, response serialization, and the typed
 * exception surface. It deliberately contains NO test assertions — it is a fixture
 * the specs drive and observe.
 */

import {
  composeApiResponse,
  CustomException,
  initLog,
  logger,
  LoggerLevel,
} from '@worktif/utils';

/**
 * Minimal, consumer-owned shape of an incoming request event. Intentionally local
 * to the fixture (a real consumer owns its own event contracts); the library does
 * not dictate this shape.
 */
export interface LambdaConsumerEvent {
  /** Logical operation the caller wants to perform. */
  readonly action: 'greet' | 'fail';
  /** Optional free-form payload echoed into the response on success. */
  readonly payload?: Record<string, unknown>;
}

/**
 * Consumer-owned response envelope returned by {@link handle}. Mirrors the shape
 * produced by the library's {@link composeApiResponse} so the e2e specs can assert
 * on stable, observable fields.
 */
export interface LambdaConsumerResult {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** Stable identifiers used for log correlation and exception attribution. */
const SERVICE_NAME = 'e2e-lambda-consumer';
const ACTION_NAME = 'lambda-consumer.handle';

/**
 * Handle a single invocation.
 *
 * Success path: logs the event at INFO and returns a serialized 200 response.
 * Failure path: raises a typed {@link CustomException} (BadRequest) which is
 * caught, logged at ERROR, and serialized into a 400 response — demonstrating the
 * public exception surface end to end.
 *
 * @param event consumer request event
 * @returns a serialized, consumer-owned API response envelope
 */
export async function handle(event: LambdaConsumerEvent): Promise<LambdaConsumerResult> {
  const log = await initLog(logger({ serviceName: SERVICE_NAME }), ACTION_NAME, LoggerLevel.Info);

  try {
    if (event.action === 'fail') {
      throw CustomException.BadRequest('Consumer requested a failure', {
        service: SERVICE_NAME,
        module: 'handler',
      });
    }

    log.now({ action: event.action, payload: event.payload } as never);

    return composeApiResponse(
      { message: 'ok', action: event.action, payload: event.payload ?? null },
      200,
    ) as LambdaConsumerResult;
  } catch (error: unknown) {
    const exception =
      error instanceof CustomException
        ? error
        : CustomException.InternalError('Unhandled consumer error', {
          service: SERVICE_NAME,
          module: 'handler',
          error,
        });

    log.now(exception as never, { level: LoggerLevel.Error } as never);

    return composeApiResponse(
      { message: exception.message, code: exception.code },
      400,
    ) as LambdaConsumerResult;
  }
}
