/**
 * @boundary Bridge overload correlations that TypeScript cannot retain in the shared implementation.
 * @allow strict-fp/no-assertion -- Overloads correlate handlers and container variants without coercing payloads.
 */
import { get, getError, isOk, isResult, isSome } from './containers.ts';
import type { AsyncResult, Err, None, Ok, Option, Result, Some } from './containers.ts';

/** The handlers {@link match} requires for a `Result`: one per variant, both required. */
export type ResultCases<Value, Problem, Success, Failure> = Readonly<{
  ok: (value: Value) => Success;
  err: (error: Problem) => Failure;
}>;
/** The handlers {@link match} requires for an `Option`: one per variant, both required. */
export type OptionCases<Value, Present, Absent> = Readonly<{
  some: (value: Value) => Present;
  none: () => Absent;
}>;

/**
 * Call the handler for the container's variant and return its result.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`; exactly one handler runs.
 * @param cases - The handlers for that container family; the other family's handlers are required too.
 * @returns The matching handler's result, or a promise of it for an `AsyncResult`.
 * @example
 * ```ts
 * const label = match(lookup(record, 'name'), {
 *   some: (value) => String(value),
 *   none: () => 'missing',
 * });
 * ```
 */
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Ok<Value>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Success;
/** Match a failed result.
 *
 * @param value - The failed result.
 * @param cases - The result handlers; only `err` runs.
 * @returns The `err` handler's result.
 */
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Err<Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Failure;
/** Match a present option.
 *
 * @param value - The present option.
 * @param cases - The option handlers; only `some` runs.
 * @returns The `some` handler's result.
 */
export function match<Value, Present, Absent>(
  value: Some<Value>,
  cases: OptionCases<Value, Present, Absent>,
): Present;
/** Match the absent option.
 *
 * @param value - The absent option.
 * @param cases - The option handlers; only `none` runs.
 * @returns The `none` handler's result.
 */
export function match<Value = never, Present = never, Absent = never>(
  value: None,
  cases: OptionCases<Value, Present, Absent>,
): Absent;
/** Match either result variant.
 *
 * @param value - The result to match.
 * @param cases - The result handlers.
 * @returns The handler result for the actual variant.
 */
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: Result<Value, Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Success | Failure;
/** Match either option variant.
 *
 * @param value - The option to match.
 * @param cases - The option handlers.
 * @returns The handler result for the actual variant.
 */
export function match<Value = never, Present = never, Absent = never>(
  value: Option<Value>,
  cases: OptionCases<Value, Present, Absent>,
): Present | Absent;
/** Match a result that is still being produced.
 *
 * @param value - The pending result.
 * @param cases - The result handlers.
 * @returns A promise of the handler result.
 */
export function match<Value = never, Problem = never, Success = never, Failure = never>(
  value: AsyncResult<Value, Problem>,
  cases: ResultCases<Value, Problem, Success, Failure>,
): Promise<Awaited<Success | Failure>>;
export function match<Value, Problem, Present, Absent>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  cases: ResultCases<Value, Problem, Present, Absent> | OptionCases<Value, Present, Absent>,
): Present | Absent | Promise<Present | Absent | Awaited<Present | Absent>> {
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

const callWithoutInput = <Problem, Output>(callback: (problem: Problem) => Output): Output =>
  (callback as () => Output)();

/**
 * Return the successful value, or evaluate the fallback lazily when it is absent.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`.
 * @param fallback - Receives the problem for a `Result` and no argument for an `Option`; never called on success.
 * @returns The value, the fallback, or a promise of either.
 * @example
 * ```ts
 * const name = getOrElse(fromNullable(externalName), () => 'anonymous');
 * ```
 */
export function getOrElse<Value = never, Problem = never, Fallback = never>(
  value: Ok<Value>,
  fallback: (error: Problem) => Fallback,
): Value;
/** Return the present value.
 *
 * @param value - The present option.
 * @param fallback - Unused on this branch.
 * @returns The present value.
 */
export function getOrElse<Value, Fallback>(value: Some<Value>, fallback: () => Fallback): Value;
/** Evaluate the fallback for a failed result.
 *
 * @param value - The failed result.
 * @param fallback - Receives the problem.
 * @returns The fallback result.
 */
export function getOrElse<Problem, Fallback>(
  value: Err<Problem>,
  fallback: (error: Problem) => Fallback,
): Fallback;
/** Evaluate the fallback for an absent option.
 *
 * @param value - The absent option.
 * @param fallback - Called with no argument.
 * @returns The fallback result.
 */
export function getOrElse<Fallback>(value: None, fallback: () => Fallback): Fallback;
/** Return the value or the fallback for either result variant.
 *
 * @param value - The result.
 * @param fallback - Receives the problem.
 * @returns The value or the fallback.
 */
export function getOrElse<Value = never, Problem = never, Fallback = never>(
  value: Result<Value, Problem>,
  fallback: (error: Problem) => Fallback,
): Value | Fallback;
/** Return the value or the fallback for either option variant.
 *
 * @param value - The option.
 * @param fallback - Called with no argument.
 * @returns The value or the fallback.
 */
export function getOrElse<Value = never, Fallback = never>(
  value: Option<Value>,
  fallback: () => Fallback,
): Value | Fallback;
/** Return the value or the fallback for a pending result.
 *
 * @param value - The pending result.
 * @param fallback - Receives the problem.
 * @returns A promise of the value or the fallback.
 */
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

/**
 * Keep the successful container, or recover from failure with the supplied fallback.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`.
 * @param fallback - Receives the problem for a `Result` and no argument for an `Option`; never called on success.
 * @returns The original success or the recovery container.
 * @example
 * ```ts
 * orElse(lookup(primary, 'name'), () => lookup(fallback, 'name'));
 * ```
 */
export function orElse<Value = never, Problem = never, Recovery = never, NextProblem = never>(
  value: Ok<Value>,
  fallback: (error: Problem) => Result<Recovery, NextProblem>,
): Ok<Value>;
/** Recover a failed result.
 *
 * @param value - The failed result.
 * @param fallback - Receives the problem and returns the recovery container.
 * @returns The recovery container.
 */
export function orElse<Problem, Next extends Result<unknown, unknown>>(
  value: Err<Problem>,
  fallback: (error: Problem) => Next,
): Next;
/** Keep the present option.
 *
 * @param value - The present option.
 * @param fallback - Unused on this branch.
 * @returns The present option unchanged.
 */
export function orElse<Value, Next extends Option<unknown>>(
  value: Some<Value>,
  fallback: () => Next,
): Some<Value>;
/** Recover an absent option.
 *
 * @param value - The absent option.
 * @param fallback - Called with no argument and returns the recovery option.
 * @returns The recovery option.
 */
export function orElse<Next extends Option<unknown>>(value: None, fallback: () => Next): Next;
/** Recover either result variant.
 *
 * @param value - The result.
 * @param fallback - Receives the problem and returns the recovery container.
 * @returns The original success or the recovery container.
 */
export function orElse<Value = never, Problem = never, Recovery = never, NextProblem = never>(
  value: Result<Value, Problem>,
  fallback: (error: Problem) => Result<Recovery, NextProblem>,
): Result<Value | Recovery, NextProblem>;
/** Recover either option variant.
 *
 * @param value - The option.
 * @param fallback - Called with no argument and returns the recovery option.
 * @returns The original present option or the recovery option.
 */
export function orElse<Value = never, Recovery = never>(
  value: Option<Value>,
  fallback: () => Option<Recovery>,
): Option<Value | Recovery>;
/** Recover a pending result.
 *
 * @param value - The pending result.
 * @param fallback - Receives the problem and returns a result or a pending result.
 * @returns A pending result of the original success or the recovery.
 */
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
