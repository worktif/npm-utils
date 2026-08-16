// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { StatusCodes } from 'http-status-codes';

/**
 * Represents a value that may or may not be defined.
 * @typeparam T - The type of the value.
 */
export type Maybe<T> = T | undefined;

/**
 * Represents a type that adds a requestId property to the given object.
 * @template T - The type of the object
 */
export type WithRequestID<T> = T & { requestId: string };

/**
 * Represents a type that can either have a value of type T or be null.
 *
 * @template T - The underlying type
 */
export type Nullable<T> = T | null;


/**
 * Represents an API error object.
 * @typedef {Object} ApiError
 * @property {*} [data] - Additional data related to the error.
 * @property {string} message - The error message.
 * @property {number} status - The HTTP status code of the error.
 */
export type ApiError = any; // @note: TS required any or never type for catch

/**
 * Represents options for querying items in a DynamoDB table based on attribute values.
 */
export type QueryByAttrOptions = {
  attributeName: string | string[];
  attributeValue: string | string[];
  indexName?: Maybe<string>;
  tableName: string;
};

/**
 * Represents the response from an API request.
 * @template T The type of the response data.
 */
export type ApiResponse = {
  statusCode: StatusCodes;
  headers: { [headerName: string]: string };
  body: string;
};

/**
 * Represents a type that allows partial modification of properties in an object recursively.
 * @template T - The type of the object to be modified.
 */
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : Maybe<T[P]>;
};

/**
 * Extracts all methods from a given type.
 * @template T - The type to extract methods from.
 */
export type MethodsOf<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
}[keyof T];

/**
 * Represents an object containing observable methods of a given type T.
 * The keys in the object are the same as the keys in type T, and the values are of type Observable.
 * @template T The type of the object containing the observable methods.
 * @typedef {Object} ObservableMethodsOf
 * @property {Observable<T[K]>} [K in keyof T] The key-value pairs where the keys are keys from T and the values are of type Observable.
 *
 * @deprecated
 *
 * @todo: replace to Observable internal NPM package
 */
// export type ObservableMethodsOf<T> = {
//   [K in keyof T]: T[K] extends (...args: any[]) => any
//     ? Observable<T[K]>
//     : never;
// }[keyof T];

/**
 * Represents a string type that represents a path to access a property in an object.
 * @template T - The type of the object being accessed
 * @template Prefix - An optional prefix string
 *
 * The KeyPath type allows for the creation of string paths that describe nested property access in an object.
 * It recursively traverses through nested objects to construct a dot-separated path based on the object structure.
 *
 * @example
 * type Person = {
 *   name: string;
 *   age: number;
 *   address: {
 *     city: string;
 *     zip: number;
 *   };
 * };
 *
 * // Example usage
 * type AddressCityPath = KeyPath<Person, 'address'>; // Result: "address.city"
 *
 * @typeparam T - The type of the object being accessed
 * @typeparam Prefix - An optional prefix string to be prepended to the path
 * @returns A string denoting the path to access a property in an object
 */
export type KeyPath<T, Prefix extends string = ''> = T extends object
  ? {
    [K in keyof T & string]: T[K] extends object
      ? `${Prefix}${K}` | KeyPath<T[K], `${Prefix}${K}.`>
      : `${Prefix}${K}`;
  }[keyof T & string]
  : never;

