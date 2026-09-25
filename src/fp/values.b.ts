/**
 * @boundary Adapt collection membership and validated decoder output into precise nominal types.
 * @allow strict-fp/no-assertion -- Runtime membership guards and public overloads establish the asserted relationship.
 */
import { get, isErr, none, ok, some } from './containers.ts';
import type { Option, Result } from './containers.ts';
import type { NonEmptyReadonlyArray } from './contracts.ts';

declare const brand: unique symbol;
export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

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

export const nonEmpty = <Value>(values: readonly Value[]): Option<NonEmptyReadonlyArray<Value>> =>
  values.length > 0 ? some(values as NonEmptyReadonlyArray<Value>) : none();

export const at = <Value>(values: readonly Value[], index: number): Option<Value> => {
  if (!Number.isInteger(index)) return none();
  const position = index < 0 ? values.length + index : index;
  return position >= 0 && position < values.length && Object.hasOwn(values, position)
    ? some(values[position] as Value)
    : none();
};

export function lookup<Key, Value>(
  values: ReadonlyMap<Key, Value>,
  key: NoInfer<Key>,
): Option<Value>;
export function lookup<Values extends object, Key extends keyof Values>(
  values: Values & (Values extends ReadonlyMap<unknown, unknown> ? never : unknown),
  key: Key,
): Option<Values[Key]>;
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
  typeof values['get'] === 'function' &&
  typeof values['has'] === 'function' &&
  Symbol.iterator in values;

export const ownEntries = <Value>(
  values: Readonly<Record<PropertyKey, Value>>,
): readonly (readonly [PropertyKey, Value])[] =>
  Reflect.ownKeys(values).map((key) => [key, values[key] as Value]);
