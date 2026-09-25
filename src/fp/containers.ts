const variant = Symbol('functional.variant');
const content = Symbol('functional.content');
const problem = Symbol('functional.problem');

export interface Ok<Value> {
  readonly [variant]: 'ok';
  readonly [content]: Value;
}
export interface Err<Problem> {
  readonly [variant]: 'err';
  readonly [problem]: Problem;
}
export interface Some<Value> {
  readonly [variant]: 'some';
  readonly [content]: Value;
}
export interface None {
  readonly [variant]: 'none';
}
export interface Unit {
  readonly [variant]: 'unit';
}
export type Result<Value, Problem> = Ok<Value> | Err<Problem>;
export type Option<Value> = Some<Value> | None;
export type AsyncResult<Value, Problem> = Promise<Result<Value, Problem>>;

const absent: None = Object.freeze<None>({ [variant]: 'none' });
const empty: Unit = Object.freeze<Unit>({ [variant]: 'unit' });

export function ok(): Ok<Unit>;
export function ok<const Value>(value: Value): Ok<Value>;
export function ok<Value>(...values: [] | [Value]): Ok<Value | Unit> {
  const container: Ok<Value | Unit> = {
    [variant]: 'ok',
    [content]: values.length === 0 ? empty : values[0],
  };
  return Object.freeze(container);
}

export const err = <const Problem>(error: Problem): Err<Problem> => {
  const container: Err<Problem> = { [variant]: 'err', [problem]: error };
  return Object.freeze(container);
};

export const some = <const Value>(value: Value): Some<Value> => {
  const container: Some<Value> = { [variant]: 'some', [content]: value };
  return Object.freeze(container);
};

export const none = (): None => absent;
export const unit = (): Unit => empty;

const hasVariant = (value: unknown, expected: string): boolean =>
  typeof value === 'object' &&
  value instanceof Object &&
  variant in value &&
  value[variant] === expected;

export const isOk = <Container>(value: Container): value is Container & Ok<unknown> =>
  hasVariant(value, 'ok');

export const isErr = <Container>(value: Container): value is Container & Err<unknown> =>
  hasVariant(value, 'err');

export const isSome = <Container>(value: Container): value is Container & Some<unknown> =>
  hasVariant(value, 'some');

export const isNone = <Container>(value: Container): value is Container & None =>
  hasVariant(value, 'none');

export const isResult = <Container>(
  value: Container,
): value is Container & Result<unknown, unknown> => isOk(value) || isErr(value);

export const isOption = <Container>(value: Container): value is Container & Option<unknown> =>
  isSome(value) || isNone(value);

export const get = <Container extends Ok<unknown> | Some<unknown>>(
  value: Container,
): Container[typeof content] => value[content];
export const getError = <Container extends Err<unknown>>(
  value: Container,
): Container[typeof problem] => value[problem];
