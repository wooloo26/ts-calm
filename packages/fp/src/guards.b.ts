/**
 * @boundary Inspect untrusted values, including hostile proxies, and report only a safe boolean.
 * Every sentinel comparison, prototype lookup and property probe runs under one `capture`, so an
 * uninspectable value fails closed as `false` instead of escaping as an exception.
 * @allow strict-fp/no-null -- The `null` return-type predicate is the whole purpose of isNull.
 * @allow strict-fp/no-undefined -- The `undefined` return-type predicate is the whole purpose of isUndefined.
 */
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

/** A primitive string. Boxed `new String('x')` is an object and fails this guard. */
export const isString = (value: unknown): value is string => typeof value === 'string';

/** A primitive boolean. Boxed `new Boolean(false)` is an object and fails this guard. */
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * A finite primitive number. `NaN`, `Infinity` and boxed `new Number(1)` fail this guard, so a
 * successful check always yields a usable number.
 */
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The `null` absence sentinel only. Prefer `fromNullable` when handling external absence. */
export const isNull = (value: unknown): value is null => safely('isNull', () => value === null);
/** The `undefined` absence sentinel only. An absent property and a stored `undefined` both match. */
export const isUndefined = (value: unknown): value is undefined =>
  safely('isUndefined', () => typeof value === 'undefined');

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
