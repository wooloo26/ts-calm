/**
 * @boundary Adapt collection membership and validated decoder output into precise nominal types.
 * @allow strict-fp/no-assertion -- Runtime membership guards and public overloads establish the asserted relationship.
 */
import { get, isErr, none, ok, some } from './containers.ts';
import type { Option, Result } from './containers.ts';
import type { NonEmptyReadonlyArray } from './contracts.ts';

declare const brand: unique symbol;
/** A `Value` proven to have passed the named validation, so equal shapes stay distinguishable. */
export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

/**
 * Turn a decoder into a brand-producing parser.
 *
 * @param name - The brand name; it appears only in the type, not at runtime.
 * @param decoder - Validates the raw input before the value may be treated as branded.
 * @returns A frozen `parse` function that fails with the decoder's problem.
 * @example
 * ```ts
 * const email = branded('email', input => isString(input) ? ok(input) : err('not text'));
 * email.parse('a@b'); // Ok<Brand<string, 'email'>>
 * ```
 */
export const branded = <const Name extends string, Input, Value, Problem>(
  name: Name,
  decoder: (input: Input) => Result<Value, Problem>,
): Readonly<{ parse: (input: Input) => Result<Brand<Value, Name>, Problem> }> => {
  const parse = (input: Input): Result<Brand<Value, typeof name>, Problem> => {
    const decoded = decoder(input);
    return isErr(decoded) ? decoded : ok(get(decoded) as Brand<Value, typeof name>);
  };
  return Object.freeze({ parse });
};

/**
 * Prove that an array has at least one element.
 *
 * @param values - The array to inspect; the view is returned, not copied.
 * @returns `Some` with the same array viewed as non-empty, or `None` for an empty or sparse array.
 */
export const nonEmpty = <Value>(values: readonly Value[]): Option<NonEmptyReadonlyArray<Value>> =>
  values.length > 0 && Object.hasOwn(values, 0)
    ? some(values as NonEmptyReadonlyArray<Value>)
    : none();

/**
 * Read one array position without reading beyond its bounds.
 *
 * @param values - The array to read; sparse holes count as absent.
 * @param index - A non-negative offset or a negative offset counted from the end.
 * @returns `Some` with the element, or `None` for an out-of-range or non-integer index.
 */
export const at = <Value>(values: readonly Value[], index: number): Option<Value> => {
  if (!Number.isInteger(index)) return none();
  const position = index < 0 ? values.length + index : index;
  return position >= 0 && position < values.length && Object.hasOwn(values, position)
    ? some(values[position] as Value)
    : none();
};

/**
 * Read one map entry without confusing a stored value with absence.
 *
 * @param values - A `ReadonlyMap` or a dictionary.
 * @param key - The key or property to look up.
 * @returns `Some` with the stored value, or `None` when the key is absent.
 */
export function lookup<Key, Value>(
  values: ReadonlyMap<Key, Value>,
  key: NoInfer<Key>,
): Option<Value>;
/** Read one dictionary property with the key checked against that dictionary.
 *
 * @param values - The dictionary to read.
 * @param key - A known property of `values`.
 * @returns `Some` with the property value, or `None` when the key is absent.
 */
export function lookup<Values extends object, Key extends keyof Values>(
  values: Values & (Values extends ReadonlyMap<unknown, unknown> ? never : unknown),
  key: Key,
): Option<Values[Key]>;
/** Read one dictionary property by a computed property key.
 *
 * @param values - The dictionary to read.
 * @param key - Any property key.
 * @returns `Some` with the value, or `None` when the key is absent.
 */
export function lookup<Values extends object>(
  values: Values & (Values extends ReadonlyMap<unknown, unknown> ? never : unknown),
  key: PropertyKey,
): Option<Values[keyof Values]>;
export function lookup<Key, Value>(
  values: ReadonlyMap<Key, Value> | Readonly<Record<PropertyKey, Value>>,
  key: Key | PropertyKey,
): Option<Value> {
  if (isReadonlyMap(values))
    return values.has(key as Key) ? some(values.get(key as Key) as Value) : none();
  const record = values as Readonly<Record<PropertyKey, Value>>;
  const property = key as PropertyKey;
  return Object.hasOwn(record, property) ? some(record[property] as Value) : none();
}

const isReadonlyMap = <Key, Value>(
  values: ReadonlyMap<Key, Value> | Readonly<Record<PropertyKey, Value>>,
): values is ReadonlyMap<Key, Value> =>
  typeof values['size'] === 'number' &&
  typeof values['get'] === 'function' &&
  typeof values['has'] === 'function' &&
  Symbol.iterator in values;

export const ownEntries = <Value>(
  values: Readonly<Record<PropertyKey, Value>>,
): readonly (readonly [PropertyKey, Value])[] =>
  Reflect.ownKeys(values).map((key) => [key, values[key] as Value]);
