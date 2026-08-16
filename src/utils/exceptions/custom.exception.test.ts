// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { CustomException, CustomErrorType } from '@utils/exceptions';

/**
 * Task 4.2 — Cover `CustomException` (Requirement 7.1: a factory-built exception carries
 * the expected error type, message, status, and payload; Requirement 7.2: an underlying
 * error is preserved).
 *
 * Characterization notes (pinned from `custom.exception.ts`, no production change):
 *
 * - There is no separate HTTP `status` field on the class. The exception's "status" is
 *   expressed by its typed `code` (a {@link CustomErrorType} string such as `NotFoundError`
 *   or `InternalError`); `type` and `status` are therefore the same observable surface and
 *   both are asserted via `code`.
 * - The "payload" is the contextual metadata carried alongside the message: the public
 *   `service` and `module` fields, the underlying cause (`getErrorCause()`), and — for the
 *   factories that accept them — the private `content` and `error` options. `content` and
 *   `error` are private with no getter, so they are read through a narrow structural cast,
 *   mirroring the approach already used in `pure.container.test.ts`.
 * - Each factory destructures only a SPECIFIC subset of options: only `InternalError`
 *   forwards `error`, and only `UnprocessableEntity` forwards `content`. The remaining
 *   options passed to a factory that does not accept them are silently dropped. These tests
 *   pin that current surface.
 */

/** Reads the private `content` payload without altering production visibility. */
const readContent = (exception: CustomException): unknown =>
  (exception as unknown as { content?: unknown }).content;

/** Reads the private `error` option captured by `InternalError`. */
const readError = (exception: CustomException): unknown =>
  (exception as unknown as { error?: unknown }).error;

/**
 * Describes a single static factory under test: its constructor, the typed `code` it must
 * stamp, its default message, and which optional payload fields it forwards. Encoding the
 * matrix as data keeps the example and property suites driven from one source of truth.
 */
interface FactoryCase {
  readonly name: string;
  readonly factory: (
    message?: string,
    options?: {
      errorCause?: unknown;
      service?: string;
      module?: string;
      content?: unknown;
      error?: unknown;
    },
  ) => CustomException;
  readonly code: CustomErrorType;
  readonly defaultMessage: string;
  readonly forwardsContent: boolean;
  readonly forwardsError: boolean;
}

const FACTORY_CASES: readonly FactoryCase[] = [
  {
    name: 'NotFound',
    factory: (m, o) => CustomException.NotFound(m, o),
    code: CustomErrorType.NotFound,
    defaultMessage: 'Unexpected error occurred. Please try again later.',
    forwardsContent: false,
    forwardsError: false,
  },
  {
    name: 'Unauthorised',
    factory: (m, o) => CustomException.Unauthorised(m, o),
    code: CustomErrorType.Unauthorized,
    defaultMessage: 'Unauthorised',
    forwardsContent: false,
    forwardsError: false,
  },
  {
    name: 'InternalError',
    factory: (m, o) => CustomException.InternalError(m, o),
    code: CustomErrorType.InternalError,
    defaultMessage: 'Internal server error',
    forwardsContent: false,
    forwardsError: true,
  },
  {
    name: 'BadRequest',
    factory: (m, o) => CustomException.BadRequest(m, o),
    code: CustomErrorType.BadRequest,
    defaultMessage: 'Invalid request',
    forwardsContent: false,
    forwardsError: false,
  },
  {
    name: 'UnprocessableEntity',
    factory: (m, o) => CustomException.UnprocessableEntity(m, o),
    code: CustomErrorType.UnprocessableEntity,
    defaultMessage: 'Entity is unprocessable',
    forwardsContent: true,
    forwardsError: false,
  },
] as const;

describe('CustomException — constructor surface (Requirements 7.1, 7.2)', () => {
  test('defaults code to InternalError and uses the default message when none is provided', () => {
    const exception = new CustomException();

    expect(exception).toBeInstanceOf(CustomException);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.code).toBe(CustomErrorType.InternalError);
    expect(exception.message).toBe('Unexpected error occurred. Please try again later.');
    expect(exception.service).toBeUndefined();
    expect(exception.module).toBeUndefined();
    expect(exception.getErrorCause()).toBeUndefined();
  });

  test('stores all provided options (code, message, service, module, errorCause, error, content)', () => {
    const cause = new Error('root-cause');
    const underlying = new TypeError('underlying');
    const content = { detail: 'extra' };

    const exception = new CustomException('explicit message', {
      code: CustomErrorType.Forbidden,
      service: 'auth-service',
      module: 'token-module',
      errorCause: cause,
      error: underlying,
      content,
    });

    expect(exception.code).toBe(CustomErrorType.Forbidden);
    expect(exception.message).toBe('explicit message');
    expect(exception.service).toBe('auth-service');
    expect(exception.module).toBe('token-module');
    // Underlying cause preserved by reference (Requirement 7.2).
    expect(exception.getErrorCause()).toBe(cause);
    expect(readError(exception)).toBe(underlying);
    expect(readContent(exception)).toBe(content);
  });

  test('falls back to InternalError when an explicit code is falsy', () => {
    // `this.code = options.code || CustomErrorType.InternalError` — pins the `||` fallback.
    const exception = new CustomException('msg', { code: undefined });

    expect(exception.code).toBe(CustomErrorType.InternalError);
  });
});

describe('CustomException — static factories (Requirement 7.1)', () => {
  test.each(FACTORY_CASES.map((c) => [c.name, c] as const))(
    '%s stamps its typed code and applies the default message when omitted',
    (_name, factoryCase) => {
      const exception = factoryCase.factory();

      expect(exception).toBeInstanceOf(CustomException);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.code).toBe(factoryCase.code);
      expect(exception.message).toBe(factoryCase.defaultMessage);
    },
  );

  test.each(FACTORY_CASES.map((c) => [c.name, c] as const))(
    '%s carries an explicit message, service, module, and preserves the underlying cause',
    (_name, factoryCase) => {
      const cause = new Error('boom');
      const exception = factoryCase.factory('custom message', {
        errorCause: cause,
        service: 'svc',
        module: 'mod',
      });

      expect(exception.code).toBe(factoryCase.code);
      expect(exception.message).toBe('custom message');
      expect(exception.service).toBe('svc');
      expect(exception.module).toBe('mod');
      expect(exception.getErrorCause()).toBe(cause);
    },
  );

  test('InternalError preserves the `error` option; the other factories drop it', () => {
    const underlying = new Error('underlying');

    const internal = CustomException.InternalError('m', { error: underlying });
    expect(readError(internal)).toBe(underlying);

    // The remaining factories do not destructure `error`, so it is silently dropped.
    for (const factoryCase of FACTORY_CASES.filter((c) => !c.forwardsError)) {
      const exception = factoryCase.factory('m', { error: underlying });
      expect(readError(exception)).toBeUndefined();
    }
  });

  test('UnprocessableEntity preserves the `content` payload; the other factories drop it', () => {
    const content = { fields: ['email'] };

    const unprocessable = CustomException.UnprocessableEntity('m', { content });
    expect(readContent(unprocessable)).toBe(content);

    for (const factoryCase of FACTORY_CASES.filter((c) => !c.forwardsContent)) {
      const exception = factoryCase.factory('m', { content });
      expect(readContent(exception)).toBeUndefined();
    }
  });
});

describe('CustomException — property-based factory integrity', () => {
  /**
   * **Feature: library-test-coverage, Property 14: CustomException factory integrity**
   *
   * For any static factory and any message/service/module/cause inputs, the resulting
   * exception carries the expected type and status (both observed via the typed `code`),
   * the exact message provided, the supplied `service`/`module` payload, and preserves any
   * underlying error by reference through `getErrorCause()`. This pins the typed error model
   * across the entire factory matrix before any refactoring.
   *
   * **Validates: Requirements 7.1, 7.2**
   */
  test('Property 14: every factory stamps the expected type/status/message/payload and preserves the cause', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: FACTORY_CASES.length - 1 }),
        fc.string(),
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        fc.string(),
        (caseIndex, message, service, module, causeMessage) => {
          const factoryCase = FACTORY_CASES[caseIndex];
          const cause = new Error(causeMessage);

          const exception = factoryCase.factory(message, {
            errorCause: cause,
            service,
            module,
          });

          // Type AND status: both surface through the typed `code`.
          expect(exception).toBeInstanceOf(CustomException);
          expect(exception).toBeInstanceOf(Error);
          expect(exception.code).toBe(factoryCase.code);
          // Message: forwarded verbatim to the native Error message.
          expect(exception.message).toBe(message);
          // Payload: contextual metadata preserved as provided.
          expect(exception.service).toBe(service);
          expect(exception.module).toBe(module);
          // Underlying error preserved by reference (Requirement 7.2).
          expect(exception.getErrorCause()).toBe(cause);
        },
      ),
      { numRuns: 100 },
    );
  });
});
