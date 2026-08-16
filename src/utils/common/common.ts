// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { StatusCodes } from 'http-status-codes';
import omit from 'lodash/omit';
import { ApiResponse, Maybe } from '@utils/common/common.types';

/**
 * Represents an empty string.
 * @type {string}
 */
export const EMPTY_STRING: string = '';

/**
 * Represents an underscore character.
 *
 * @type {string}
 */
export const UNDERSCORE: string = '_';

/**
 * Variable representing an empty number value.
 *
 * @type {number}
 */
export const EMPTY_NUMBER: number = 0;

/**
 * Represents the character '/'.
 *
 * @constant
 * @type {string}
 * @since 1.0.0
 */
export const SLASH: string = '/';

/**
 * The DASH variable represents a dash character '-'. This character is commonly used as a separator
 * or to indicate a range between two values.
 *
 * @type {string}
 */
export const DASH: string = '-';

/**
 * Represents a DOT.
 *
 * @constant
 * @type {string}
 */
export const DOT: string = '.';

/**
 * Represents the character ';' which is commonly known as a semicolon.
 *
 * @constant
 * @type {string}
 * @description The semicolon is a punctuation mark commonly used in programming to separate statements
 *              or elements in a list. It is typically used in languages like JavaScript and C.
 */
export const SEMICOLUMN: string = ';';

/**
 * Represents a space character.
 *
 * @type {string}
 * @constant
 */
export const SPACE: string = ' ';

/**
 * A string constant representing a single comma (`,`) character.
 *
 * This variable is commonly used as a separator in data processing,
 * such as parsing or formatting CSV (Comma-Separated Values) files,
 * or when delimiters in text data require a comma character.
 *
 * Value: `,`
 *
 * @type {string}
 */
export const COMMA: string = ',';

/**
 * A boolean flag that indicates whether the current environment is a web browser.
 * The value is determined by checking the presence of both the `window` and `document` objects.
 * It evaluates to `true` if the code is running in a browser environment and `false` otherwise.
 */
export const isBrowser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Composes an API response object.
 *
 * @param {T extends Maybe<object | string>} response - The response data to include in the API response.
 * @param {number} statusCode - The HTTP status code to set in the API response. Default is 200.
 * @param contentType
 * @param crucialPoints
 * @return {unknown} - The composed API response object.
 */
export function composeApiResponse<T extends Maybe<object | string>>(
  response: T,
  statusCode: StatusCodes = StatusCodes.OK,
  contentType = 'application/json',
  crucialPoints: string[] = [],
): ApiResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    },
    body: response
      ? JSON.stringify(omitInternally(response, crucialPoints))
      : EMPTY_STRING,
  };
}

/**
 * Omits specific properties from the given object based on predefined keys
 * while considering crucial points that should not be omitted.
 *
 * @param {T} response - The object from which specified properties will be omitted.
 * @param {string[]} crucialPoints - An array of property names that should not be omitted.
 * @return {Partial<T>} A new object with the selected properties omitted.
 */
export function omitInternally<T extends object>(
  response: T,
  crucialPoints: string[],
): Partial<T> {
  return omit<T>(
    response,
    [
      '__typename',
      'id',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
      'deletedBy',
      'password',
    ].filter((point: string) => !crucialPoints.includes(point)),
  );
}

/**
 * Capitalizes the first letter of each word in a sentence.
 *
 * @param {string} sentence - The sentence to capitalize.
 * @returns {string} - The sentence with the first letter of each word capitalized.
 */
export function capitalizeFirstLetters(sentence: string): string {
  return sentence
    .split(' ')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extracts and returns the error message from the provided error object.
 *
 * @param {any} e - The error object from which the message will be retrieved.
 * @return {string} The message extracted from the provided error object.
 */
export function error(e: any): string {
  return (e as Error).message;
}


/**
 * Represents a generic object where keys are strings and values are of a specified type.
 *
 * This utility type is designed to create objects with uniform value types. It can be used
 * when you want the values of an object to conform to a specific type.
 *
 * @template T - The type of the values within the object.
 */
type NestedObject<T> = Record<string, T>;

/**
 * Enum representing the possible settled status of a Promise.
 * @enum {string}
 */
export enum PromiseSettledStatus {
  Fulfilled = 'fulfilled',
  Rejected = 'rejected',
}

/**
 * Returns an array of fulfilled values from an array of settled promises.
 *
 * @param {PromiseSettledResult[]} result - An array of settled promises.
 *
 * @todo: Promise.allSettled<PromiseSettledResult<T>>
 *
 * @return {Array} - An array of fulfilled values.
 */
export async function completePromiseSettled<T>(
  result: PromiseSettledResult<T>[],
): Promise<{ [status: string]: T[] }> {
  return Object.fromEntries(
    Object.values(PromiseSettledStatus).map((status: string) => [
      status,
      result
        .filter(
          (promiseItem: PromiseSettledResult<T>) =>
            promiseItem.status === status,
        )
        .map((promiseItem: PromiseSettledResult<T>) =>
          status === PromiseSettledStatus.Fulfilled
            ? (promiseItem as PromiseFulfilledResult<T>).value
            : (promiseItem as PromiseRejectedResult).reason,
        ),
    ]),
  );
}

/**
 * Selects specific properties from an object based on the provided keys.
 *
 * @param {T} obj - The source object to pick properties from.
 * @param {K[]} keys - An array of keys specifying which properties to pick from the object.
 * @return {Pick<T, K>} A new object containing only the selected properties.
 */
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const entries = keys.map((key: K): (K | T[K])[] => [key, obj[key]]);
  return Object.fromEntries(entries) as Pick<T, K>;
}

/**
 * Computes the intersection of two arrays, returning an array that contains only the elements
 * that are present in both input arrays. Duplicate values in the input arrays are ignored.
 * intersection
 * @param {T[]} arr1 - The first input array.
 * @param {T[]} arr2 - The second input array.
 * @return {T[]} An array containing the elements that are present in both `arr1` and `arr2`.
 */
export function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const set1 = new Set(arr1);
  const set2 = new Set(arr2);
  const result: T[] = [];

  Array.from(set1).forEach(item => {
    if (set2.has(item)) {
      result.push(item);
    }
  });

  return result;
}

