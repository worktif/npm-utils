// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { injectable } from 'inversify';

import { GqlToNull, GqlToVoid } from '@utils/serializer';

/**
 * Returns the current date and time as a string in ISO format.
 *
 * @return {string} The current date and time in ISO format.
 */
export function dateNow(): string {
  return new Date().toISOString();
}

/**
 * Converts the provided argument into a nullable GraphQL type.
 *
 * @param bodyOrResponse The input to be transformed into a nullable GraphQL type.
 * @return The transformed input as a nullable GraphQL type.
 */
export function identityToNull<RS, T>(bodyOrResponse: RS): GqlToNull<T> {
  return identity<GqlToNull<RS>, GqlToNull<T>>(fromVoidToNull(bodyOrResponse));
}

/**
 * Transforms a given input value by converting it from a type `RS` to a type that ensures it conforms to `GqlToVoid<T>`.
 *
 * @param {RS} bodyOrResponse - The input value to be transformed.
 * @return {GqlToVoid<T>} The transformed value with type `GqlToVoid<T>`.
 */
export function identityToVoid<RS, T>(bodyOrResponse: RS): GqlToVoid<T> {
  return identity<GqlToVoid<RS>, GqlToVoid<T>>(fromNullToVoid(bodyOrResponse));
}

/**
 * A generic function that takes an input and directly returns an output.
 *
 * @param {RS} bodyOrResponse - The input value of generic type RS to be processed or returned as is.
 * @return {T} The output value of generic type T, derived from the input.
 */
export function identity<RS, T>(bodyOrResponse: RS): T {
  return _identity<T>(bodyOrResponse);
}

/**
 * Converts any undefined or void 0 value in the input object to null recursively.
 *
 * @param {any} obj The input object to convert undefined values to null.
 * @return {any} The object with undefined values replaced by null.
 * @private
 */
export function fromVoidToNull(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => fromVoidToNull(item));
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        value === undefined || value === void 0 ? null : fromVoidToNull(value),
      ]),
    );
  }
  return obj;
}

/**
 * Convert null values to undefined in a given object or array recursively.
 *
 * @param {any} obj - The object or array to process.
 * @private
 * @return {any} - The processed object with null values replaced with undefined.
 */
export function fromNullToVoid(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => fromNullToVoid(item));
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        value === null ? void 0 : fromVoidToNull(value),
      ]),
    );
  }
  return obj;
}

// @consider: life-hack, how to solve?
export function _identity<T>(bodyOrResponse: any): T {
  return bodyOrResponse as T;
}


/**
 * Utility class for serialization operations.
 * @purable
 *
 * @todo: test this scenario with a product decorator naming
 */
@injectable()
export class SerializerUtils {
  /**
   * Binds specific utility methods to the instance when a new instance is created.
   *
   * @return {void} This method does not return any value.
   */
  constructor() {
    this.identity = this.identity.bind(this);
    this.identityToNull = this.identityToNull.bind(this);
    this.identityToVoid = this.identityToVoid.bind(this);
    this.dateNow = this.dateNow.bind(this);
    this.fromVoidToNull = this.fromVoidToNull.bind(this);
    this.fromNullToVoid = this.fromNullToVoid.bind(this);
  }

  public identityToNull<RS, T>(bodyOrResponse: RS): GqlToNull<T> {
    return this._identity<GqlToNull<T>>(this.fromVoidToNull(bodyOrResponse));
  }

  public identityToVoid<RS, T>(bodyOrResponse: RS): GqlToVoid<T> {
    return this._identity<GqlToVoid<T>>(this.fromNullToVoid(bodyOrResponse));
  }

  public identity<RS, T>(bodyOrResponse: RS): T {
    return this._identity<T>(bodyOrResponse);
  }

  /**
   * Get the current date and time in ISO format.
   *
   * @todo: compose Date interdependent serializer
   *
   * @return {string} The current date and time in ISO format (YYYY-MM-DDTHH:MM:SS.SSSZ).
   */
  public dateNow(): string {
    return new Date().toISOString();
  }

  /**
   * Converts any undefined or void 0 value in the input object to null recursively.
   *
   * @param {any} obj The input object to convert undefined values to null.
   * @return {any} The object with undefined values replaced by null.
   * @private
   */
  public fromVoidToNull(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.fromVoidToNull(item));
    } else if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key,
          value === undefined || value === void 0 ? null : this.fromVoidToNull(value),
        ]),
      );
    }
    return obj;
  }

  /**
   * Convert null values to undefined in a given object or array recursively.
   *
   * @param {any} obj - The object or array to process.
   * @private
   * @return {any} - The processed object with null values replaced with undefined.
   */
  public fromNullToVoid(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.fromNullToVoid(item));
    } else if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key,
          value === null ? void 0 : this.fromVoidToNull(value),
        ]),
      );
    } else {
      return obj;
    }
  }

  // @consider: life-hack, how to solve?
  public _identity<T>(bodyOrResponse: any): T {
    return bodyOrResponse as T;
  }
}
