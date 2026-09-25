/**
 * @boundary Adapt external nullable values into Option while preserving all other falsy values.
 * @allow strict-fp/no-null -- Compare only against the external absence sentinel.
 * @allow strict-fp/no-undefined -- Compare only against the external absence sentinel.
 */
import { none, some } from './containers.ts';
import type { Option } from './containers.ts';

/**
 * Reject only external null and undefined. Every other falsy value, including 0, false and the
 * empty string, is a real value and stays inside the Option.
 */
export const isNonNullable = <Value>(value: Value): value is NonNullable<Value> =>
  value !== null && value !== undefined;

export const fromNullable = <Value>(value: Value): Option<NonNullable<Value>> =>
  isNonNullable(value) ? some(value) : none();
