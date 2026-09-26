import { err, get, getError, isErr, isSome, ok, none } from './containers.ts';
import type { Err, Ok, Option, Result } from './containers.ts';
import type { NonEmptyReadonlyArray } from './contracts.ts';
import { nonEmpty, ownEntries } from './values.b.ts';

/**
 * Prove that every key produced by `keyOf` occurs once.
 *
 * @param values - The array to inspect.
 * @param keyOf - Maps each value to the key whose uniqueness matters.
 * @returns `true` when no two values share a key.
 */
export const isUniqueBy = <Value, Key extends PropertyKey>(
  values: readonly Value[],
  keyOf: (value: Value) => Key,
): boolean => {
  const seen = new Set<Key>();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
};

type ResultValue<Container> = Container extends Ok<infer Value> ? Value : never;
type ResultProblem<Container> = Container extends Err<infer Problem> ? Problem : never;
type Collected<Values> = { readonly [Key in keyof Values]: ResultValue<Values[Key]> };
type CollectionProblem<Values> = Values extends readonly unknown[]
  ? ResultProblem<Values[number]>
  : ResultProblem<Values[keyof Values]>;
type ResultRecord = Readonly<Record<PropertyKey, Result<unknown, unknown>>>;
type ResultCollection = readonly Result<unknown, unknown>[] | ResultRecord;
const isArray = (values: ResultCollection): values is readonly Result<unknown, unknown>[] =>
  Array.isArray(values);

/**
 * Collect a list of results, stopping at the first failure.
 *
 * @param values - An array or dictionary of results; a dictionary keeps its own keys.
 * @returns `Ok` with every value in the same shape, or the first `Err` unchanged.
 */
export function all<const Values extends readonly Result<unknown, unknown>[]>(
  values: Values,
): Result<Collected<Values>, CollectionProblem<Values>>;
export function all<const Values extends ResultRecord>(
  values: Values,
): Result<Collected<Values>, CollectionProblem<Values>>;
export function all(values: ResultCollection): Result<unknown, unknown> {
  if (isArray(values)) {
    const output: unknown[] = [];
    for (const value of values) {
      if (isErr(value)) return value;
      output.push(get(value));
    }
    return ok(output);
  }
  const output: (readonly [PropertyKey, unknown])[] = [];
  for (const [key, value] of ownEntries(values)) {
    if (isErr(value)) return value;
    output.push([key, get(value)]);
  }
  return ok(Object.fromEntries(output));
}

/**
 * Validate a list of results and collect every failure at once.
 *
 * @param values - An array or dictionary of results.
 * @returns `Ok` with every value, or `Err` with all problems in a non-empty array.
 */
export function validateAll<const Values extends readonly Result<unknown, unknown>[]>(
  values: Values,
): Result<Collected<Values>, NonEmptyReadonlyArray<CollectionProblem<Values>>>;
export function validateAll<const Values extends ResultRecord>(
  values: Values,
): Result<Collected<Values>, NonEmptyReadonlyArray<CollectionProblem<Values>>>;
export function validateAll(
  values: ResultCollection,
): Result<unknown, NonEmptyReadonlyArray<unknown>> {
  const entries = isArray(values) ? [...values.entries()] : ownEntries(values);
  const output: (readonly [PropertyKey, unknown])[] = [];
  const errors: unknown[] = [];
  for (const [key, value] of entries) {
    if (isErr(value)) errors.push(getError(value));
    else output.push([key, get(value)]);
  }
  const failures = nonEmpty(errors);
  return isSome(failures)
    ? err(get(failures))
    : ok(isArray(values) ? output.map((entry) => entry[1]) : Object.fromEntries(output));
}

/**
 * Transform and keep only the present values of an array.
 *
 * @param values - The array to map.
 * @param transform - Receives each value and its index; return `none()` to drop the element.
 * @returns The present results in order, with no holes.
 */
export const filterMap = <Input, Value>(
  values: readonly Input[],
  transform: (value: Input, index: number) => Option<Value>,
): readonly Value[] => {
  const output: Value[] = [];
  for (const [index, value] of values.entries()) {
    const transformed = transform(value, index);
    if (isSome(transformed)) output.push(get(transformed));
  }
  return output;
};

/**
 * Return the first present transform result, without visiting later elements.
 *
 * @param values - The array to search in order.
 * @param transform - Receives each value and its index; return `some` to stop.
 * @returns The first present result, or `none()`.
 */
export const findMap = <Input, Value>(
  values: readonly Input[],
  transform: (value: Input, index: number) => Option<Value>,
): Option<Value> => {
  for (const [index, value] of values.entries()) {
    const transformed = transform(value, index);
    if (isSome(transformed)) return transformed;
  }
  return none();
};
