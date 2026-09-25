import { capture } from './capture.b.ts';
import { get, isOk } from './containers.ts';
import { isNonNullable } from './nullable.b.ts';

const safely = (name: string, predicate: () => boolean): boolean => {
  const result = capture(predicate, { name });
  return isOk(result) && get(result);
};

/** Narrow an external value to a readonly array of unknown elements; unreadable proxies fail closed. */
export const isArray = (value: unknown): value is readonly unknown[] =>
  safely('isArray', () => Array.isArray(value));

/** Non-null objects, including arrays, Date and Map. Excludes functions; does not imply a dictionary. */
export const isObject = (value: unknown): value is object =>
  typeof value === 'object' &&
  isNonNullable(value) &&
  safely('isObject', () => {
    Object.getPrototypeOf(value);
    return true;
  });

/** Current-realm ordinary or null-prototype dictionaries; values remain unknown, not validated DTOs. */
export const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' &&
  isNonNullable(value) &&
  safely('isPlainObject', () => {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || !isNonNullable(prototype);
  });

/** A union key proves one member, never every member of that union. */
export type OwnProperty<Key extends PropertyKey> = Key extends PropertyKey
  ? Readonly<Record<Key, unknown>>
  : never;

/** Check an own property without reading its getter. The property's value still needs validation. */
export const hasOwn = <Key extends PropertyKey>(
  value: unknown,
  key: Key,
): value is object & OwnProperty<Key> =>
  isObject(value) && safely('hasOwn', () => Object.hasOwn(value, key));
