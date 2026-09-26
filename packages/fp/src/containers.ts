const variant = Symbol('functional.variant');
const content = Symbol('functional.content');
const problem = Symbol('functional.problem');
// Identity, not observable properties, authenticates a container. Weak keys do not retain payloads.
const identities = new WeakMap<object, string>();

/** A successful result carrying one value. Created by {@link ok}; the payload is private. */
export interface Ok<Value> {
  readonly [variant]: 'ok';
  readonly [content]: Value;
}
/** A failed result carrying one problem. Created by {@link err}; the payload is private. */
export interface Err<Problem> {
  readonly [variant]: 'err';
  readonly [problem]: Problem;
}
/** A present option carrying one value. Created by {@link some}; the payload is private. */
export interface Some<Value> {
  readonly [variant]: 'some';
  readonly [content]: Value;
}
/** An absent option. Created by {@link none} and compared by identity. */
export interface None {
  readonly [variant]: 'none';
}
/** The result of a successful operation that produced no value. Created by {@link unit}. */
export interface Unit {
  readonly [variant]: 'unit';
}
/** Success ({@link Ok}) or failure ({@link Err}) of one operation. */
export type Result<Value, Problem> = Ok<Value> | Err<Problem>;
/** Presence ({@link Some}) or absence ({@link None}) of a value. */
export type Option<Value> = Some<Value> | None;
/** A `Result` that is still being produced; combinator overloads accept it directly. */
export type AsyncResult<Value, Problem> = Promise<Result<Value, Problem>>;

const absent: None = Object.freeze<None>({ [variant]: 'none' });
const empty: Unit = Object.freeze<Unit>({ [variant]: 'unit' });

/**
 * Create a successful `Result` without a value.
 *
 * @returns An `Ok<Unit>`.
 */
export function ok(): Ok<Unit>;
/**
 * Create a successful `Result` around one value.
 *
 * @param value - The payload; it is kept by reference, never cloned.
 * @returns An `Ok` carrying the value.
 */
export function ok<const Value>(value: Value): Ok<Value>;
export function ok<Value>(...values: [] | [Value]): Ok<Value | Unit> {
  const container: Ok<Value | Unit> = {
    [variant]: 'ok',
    [content]: values.length === 0 ? empty : values[0],
  };
  identities.set(container, 'ok');
  return Object.freeze(container);
}

/**
 * Create a failed `Result`.
 *
 * @param error - The problem value; any type is allowed, including `undefined`.
 * @returns An `Err` carrying the problem.
 */
export const err = <const Problem>(error: Problem): Err<Problem> => {
  const container: Err<Problem> = { [variant]: 'err', [problem]: error };
  identities.set(container, 'err');
  return Object.freeze(container);
};

/**
 * Create a present `Option`.
 *
 * @param value - The present value; `0`, `false` and `''` are real values, not absence.
 * @returns A `Some` carrying the value.
 */
export const some = <const Value>(value: Value): Some<Value> => {
  const container: Some<Value> = { [variant]: 'some', [content]: value };
  identities.set(container, 'some');
  return Object.freeze(container);
};

/**
 * Create the absent `Option`.
 *
 * @returns The shared `None` singleton; every call returns the same frozen value.
 */
export const none = (): None => absent;
/**
 * Create the value of a successful operation with no payload.
 *
 * @returns The shared `Unit` singleton; every call returns the same frozen value.
 */
export const unit = (): Unit => empty;

const hasVariant = (value: unknown, expected: string): boolean =>
  typeof value === 'object' && !!value && identities.get(value) === expected;

/**
 * Test whether a value is an `Ok` produced by this library.
 *
 * @param value - Any value; only identities registered by this module are accepted.
 * @returns `true` only for a genuine `Ok`.
 */
export const isOk = <Container>(value: Container): value is Container & Ok<unknown> =>
  hasVariant(value, 'ok');

/**
 * Test whether a value is an `Err` produced by this library.
 *
 * @param value - Any value; only identities registered by this module are accepted.
 * @returns `true` only for a genuine `Err`.
 */
export const isErr = <Container>(value: Container): value is Container & Err<unknown> =>
  hasVariant(value, 'err');

/**
 * Test whether a value is a `Some` produced by this library.
 *
 * @param value - Any value; only identities registered by this module are accepted.
 * @returns `true` only for a genuine `Some`.
 */
export const isSome = <Container>(value: Container): value is Container & Some<unknown> =>
  hasVariant(value, 'some');

/**
 * Test whether a value is the `None` singleton.
 *
 * @param value - Any value; only this module's shared singleton is accepted.
 * @returns `true` only for a genuine `None`.
 */
export const isNone = <Container>(value: Container): value is Container & None => value === absent;

/**
 * Test whether a value is a `Result` produced by this library.
 *
 * @param value - Any value; an `Option` is not a `Result`.
 * @returns `true` for a genuine `Ok` or `Err`.
 */
export const isResult = <Container>(
  value: Container,
): value is Container & Result<unknown, unknown> => isOk(value) || isErr(value);

/**
 * Test whether a value is an `Option` produced by this library.
 *
 * @param value - Any value; a `Result` is not an `Option`.
 * @returns `true` for a genuine `Some` or `None`.
 */
export const isOption = <Container>(value: Container): value is Container & Option<unknown> =>
  isSome(value) || isNone(value);

/**
 * Read the payload of a known-successful container without a throw.
 *
 * @param value - A known `Ok` or `Some`; narrow with {@link match} or {@link isOk}/{@link isSome} first.
 * @returns The carried value.
 */
export const get = <Container extends Ok<unknown> | Some<unknown>>(
  value: Container,
): Container[typeof content] => value[content];
/**
 * Read the problem of a known-failed result without a throw.
 *
 * @param value - A known `Err`; narrow with {@link match} or {@link isErr} first.
 * @returns The carried problem.
 */
export const getError = <Container extends Err<unknown>>(
  value: Container,
): Container[typeof problem] => value[problem];
