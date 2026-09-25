/**
 * @boundary Bridge overload correlations that TypeScript cannot retain in the shared implementation.
 * @allow strict-fp/no-assertion -- Overloads correlate handlers and container variants without coercing payloads.
 */
import { get, getError, isOk, isResult, isSome } from './containers.ts';
import type { AsyncResult, Err, None, Ok, Option, Result, Some } from './containers.ts';

export type ResultCases<Value, Problem, Success, Failure> = Readonly<{
  ok: (value: Value) => Success;
  err: (error: Problem) => Failure;
}>;
export type OptionCases<Value, Present, Absent> = Readonly<{
  some: (value: Value) => Present;
  none: () => Absent;
}>;

export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Ok<Value>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Success;
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Err<Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Failure;
export function match<Value, Present, Absent>(
  value: Some<Value>,
  cases: OptionCases<Value, Present, Absent>,
): Present;
export function match<Value = never, Present = never, Absent = never>(
  value: None,
  cases: OptionCases<Value, Present, Absent>,
): Absent;
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Result<Value, Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Success | Failure;
export function match<Value = never, Present = never, Absent = never>(
  value: Option<Value>,
  cases: OptionCases<Value, Present, Absent>,
): Present | Absent;
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: AsyncResult<Value, Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Promise<Awaited<Success | Failure>>;
export function match<Value, Problem, Present, Absent>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  cases: ResultCases<Value, Problem, Present, Absent> | OptionCases<Value, Present, Absent>,
): Present | Absent | Promise<Present | Absent | Awaited<Present | Absent>> {
  // Public overloads prove the container/case correlation; no payload is asserted.
  if ('then' in value)
    return value.then((result) =>
      match(result, cases as ResultCases<Value, Problem, Present, Absent>),
    );
  if (isResult(value)) {
    const handlers = cases as ResultCases<Value, Problem, Present, Absent>;
    return isOk(value) ? handlers.ok(get(value)) : handlers.err(getError(value));
  }
  const handlers = cases as OptionCases<Value, Present, Absent>;
  return isSome(value) ? handlers.some(get(value)) : handlers.none();
}

// The Option overload guarantees a zero-argument fallback on this branch.
const callWithoutInput = <Problem, Output>(callback: (problem: Problem) => Output): Output =>
  (callback as () => Output)();

export function getOrElse<Value = never, Problem = never, Fallback = never>(
  value: Ok<Value>,
  fallback: (error: Problem) => Fallback,
): Value;
export function getOrElse<Value, Fallback>(value: Some<Value>, fallback: () => Fallback): Value;
export function getOrElse<Problem, Fallback>(
  value: Err<Problem>,
  fallback: (error: Problem) => Fallback,
): Fallback;
export function getOrElse<Fallback>(value: None, fallback: () => Fallback): Fallback;
export function getOrElse<Value = never, Problem = never, Fallback = never>(
  value: Result<Value, Problem>,
  fallback: (error: Problem) => Fallback,
): Value | Fallback;
export function getOrElse<Value = never, Fallback = never>(
  value: Option<Value>,
  fallback: () => Fallback,
): Value | Fallback;
export function getOrElse<Value = never, Problem = never, Fallback = never>(
  value: AsyncResult<Value, Problem>,
  fallback: (error: Problem) => Fallback,
): Promise<Awaited<Value | Fallback>>;
export function getOrElse<Value, Problem, Fallback>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  fallback: (error: Problem) => Fallback,
): Value | Fallback | Promise<Value | Fallback | Awaited<Value | Fallback>> {
  if ('then' in value)
    return value.then((result) => (isOk(result) ? get(result) : fallback(getError(result))));
  if (isResult(value)) return isOk(value) ? get(value) : fallback(getError(value));
  return isSome(value) ? get(value) : callWithoutInput(fallback);
}

export function orElse<Value = never, Problem = never, Recovery = never, NextProblem = never>(
  value: Ok<Value>,
  fallback: (error: Problem) => Result<Recovery, NextProblem>,
): Ok<Value>;
export function orElse<Problem, Next extends Result<unknown, unknown>>(
  value: Err<Problem>,
  fallback: (error: Problem) => Next,
): Next;
export function orElse<Value, Next extends Option<unknown>>(
  value: Some<Value>,
  fallback: () => Next,
): Some<Value>;
export function orElse<Next extends Option<unknown>>(value: None, fallback: () => Next): Next;
export function orElse<Value = never, Problem = never, Recovery = never, NextProblem = never>(
  value: Result<Value, Problem>,
  fallback: (error: Problem) => Result<Recovery, NextProblem>,
): Result<Value | Recovery, NextProblem>;
export function orElse<Value = never, Recovery = never>(
  value: Option<Value>,
  fallback: () => Option<Recovery>,
): Option<Value | Recovery>;
export function orElse<Value = never, Problem = never, Recovery = never, NextProblem = never>(
  value: AsyncResult<Value, Problem>,
  fallback: (error: Problem) => Result<Recovery, NextProblem> | AsyncResult<Recovery, NextProblem>,
): AsyncResult<Value | Recovery, NextProblem>;
export function orElse<Value, Problem, Recovery, NextProblem>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  fallback: (
    error: Problem,
  ) => Result<Recovery, NextProblem> | Option<Recovery> | AsyncResult<Recovery, NextProblem>,
):
  | Result<Value | Recovery, NextProblem>
  | Option<Value | Recovery>
  | Promise<Result<Value | Recovery, NextProblem> | Option<Value | Recovery>> {
  if ('then' in value)
    return value.then((result) => (isOk(result) ? result : fallback(getError(result))));
  if (isResult(value)) return isOk(value) ? value : fallback(getError(value));
  return isSome(value) ? value : callWithoutInput(fallback);
}
