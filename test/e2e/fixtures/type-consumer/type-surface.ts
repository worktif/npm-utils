// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

/**
 * External-consumer fixture: public TYPE-SURFACE exercise.
 *
 * Spec: library-test-coverage — Task 7.2 (Property 24, Requirement 11.2).
 *
 * This module is compiled (NOT executed) against the BUILT type entry
 * (`dist/src/index.d.ts`) by `consumer.types.e2e.test.ts`. It models how a
 * downstream TypeScript consumer of the PUBLISHED package consumes the public type
 * surface: every symbol below is imported EXCLUSIVELY from the package specifier
 * `@worktif/utils` — never from `src/`, never via the `@core/*` / `@utils/*`
 * repository path aliases. Under `tsconfig.e2e.json` that specifier resolves to the
 * built declaration entry, exactly as a real consumer's `node_modules` install would.
 *
 * The fixture deliberately touches a representative cross-section of the documented
 * public type surface — interfaces, generic type aliases, enums used as types, and
 * runtime values used in type positions — so that compiling it proves the declared
 * contract resolves with zero type errors. It contains NO test assertions and NO
 * top-level side effects; the spec drives the compiler over it.
 */

import {
  // Runtime values referenced in type positions / call positions.
  composeApiResponse,
  CustomException,
  LoggerLevel,
  WebsiteStage,
  // Interfaces (documented public type surface).
  type CustomErrorOptions,
  type LambdaHandlerInterface,
  type LoggerInstance,
  type LoggerInterface,
  // Generic + utility type aliases (documented public type surface).
  type ApiError,
  type ApiResponse,
  type Maybe,
  type Newable,
  type Nullable,
  type QueryByAttrOptions,
  type RecursivePartial,
  type WithRequestID,
} from '@worktif/utils';

/** `Maybe<T>` resolves to an optional value alias. */
export const maybeValue: Maybe<string> = undefined;

/** `Nullable<T>` resolves to a nullable value alias. */
export const nullableValue: Nullable<number> = null;

/** `WithRequestID<T>` augments a payload with a correlation id. */
export type CorrelatedPayload = WithRequestID<{ readonly name: string }>;
export const correlated: CorrelatedPayload = { name: 'consumer', requestId: 'req-1' };

/** `Newable<T>` describes a constructable producing the public exception type. */
export const exceptionCtor: Newable<CustomException> = CustomException;

/** `ApiError` is part of the documented surface. */
export const apiError: ApiError = { message: 'boom', status: 400 };

/** `QueryByAttrOptions` resolves with its documented members. */
export const query: QueryByAttrOptions = {
  attributeName: 'pk',
  attributeValue: 'value',
  tableName: 'consumer-table',
};

/** `RecursivePartial<T>` resolves as a deep-optional mapped type. */
export const partialConfig: RecursivePartial<{ a: { b: number } }> = { a: {} };

/**
 * `composeApiResponse` returns the documented `ApiResponse` shape; using it in an
 * `ApiResponse`-typed position proves both the runtime export and the type alias.
 */
export function buildResponse(): ApiResponse {
  return composeApiResponse({ message: 'ok' }, 200);
}

/** Enums resolve as both value and type. */
export const stage: WebsiteStage = WebsiteStage.Prod;
export const level: LoggerLevel = LoggerLevel.Info;

/**
 * `LambdaHandlerInterface<Event, Res>` is implementable by a consumer handler — the
 * canonical public contract for a Lambda-style entry point.
 */
export class TypeSurfaceHandler
  implements LambdaHandlerInterface<{ readonly id: string }, ApiResponse> {
  public async handler(event: { readonly id: string }): Promise<ApiResponse> {
    return composeApiResponse({ id: event.id }, 200);
  }
}

/** `CustomErrorOptions` resolves and is accepted by the exception constructor. */
export function raise(options: CustomErrorOptions): CustomException {
  return new CustomException('typed', options);
}

/**
 * `LoggerInstance` and `LoggerInterface` resolve as referenceable contracts. They are
 * referenced in type position only (a consumer need not construct them to depend on
 * the declared surface).
 */
export declare const loggerInstance: LoggerInstance;
export declare const loggerImpl: LoggerInterface;
