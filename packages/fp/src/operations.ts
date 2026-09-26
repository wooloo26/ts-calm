import {
  err,
  get,
  getError,
  isErr,
  isNone,
  isOk,
  isResult,
  isSome,
  none,
  ok,
  some,
} from './containers.ts';
import type { AsyncResult, Err, None, Ok, Option, Result, Some } from './containers.ts';
import type { Synchronous } from './contracts.ts';

/**
 * Transform the successful payload, leaving failures and absence untouched.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`.
 * @param transform - Called only with a present payload; a strict `Synchronous` result rejects promises on the synchronous overloads.
 * @returns The same container family with the transformed payload.
 * @example
 * ```ts
 * get(map(ok(3), (value) => value + 1)); // 4
 * ```
 */
export function map<Value, Output>(
  value: Ok<Value>,
  transform: (value: Value) => Synchronous<Output>,
): Ok<Output>;
export function map<Value = never, Problem = never, Output = never>(
  value: Err<Problem>,
  transform: (value: Value) => Synchronous<Output>,
): Err<Problem>;
export function map<Value, Output>(
  value: Some<Value>,
  transform: (value: Value) => Synchronous<Output>,
): Some<Output>;
export function map<Value = never, Output = never>(
  value: None,
  transform: (value: Value) => Synchronous<Output>,
): None;
export function map<Value = never, Problem = never, Output = never>(
  value: Result<Value, Problem>,
  transform: (value: Value) => Synchronous<Output>,
): Result<Output, Problem>;
export function map<Value = never, Output = never>(
  value: Option<Value>,
  transform: (value: Value) => Synchronous<Output>,
): Option<Output>;
export function map<Value = never, Problem = never, Output = never>(
  value: AsyncResult<Value, Problem>,
  transform: (value: Value) => Output,
): AsyncResult<Awaited<Output>, Problem>;
export function map<Value, Problem, Output>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  transform: (value: Value) => Output,
): Result<Output, Problem> | Option<Output> | AsyncResult<Awaited<Output>, Problem> {
  if ('then' in value)
    return value.then(async (result) => (isOk(result) ? ok(await transform(get(result))) : result));
  if (isResult(value)) return isOk(value) ? ok(transform(get(value))) : value;
  return isSome(value) ? some(transform(get(value))) : value;
}

/**
 * Chain a transform that itself returns the same container family.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`.
 * @param transform - Called only with a present payload and returns the next container.
 * @returns The produced container, or the untouched failure or absence.
 */
export function flatMap<Value, Next extends Result<unknown, unknown>>(
  value: Ok<Value>,
  transform: (value: Value) => Next,
): Next;
export function flatMap<Value = never, Problem = never, Output = never, NextProblem = never>(
  value: Err<Problem>,
  transform: (value: Value) => Result<Output, NextProblem>,
): Err<Problem>;
export function flatMap<Value, Next extends Option<unknown>>(
  value: Some<Value>,
  transform: (value: Value) => Next,
): Next;
export function flatMap<Value = never, Output = never>(
  value: None,
  transform: (value: Value) => Option<Output>,
): None;
export function flatMap<Value = never, Problem = never, Output = never, NextProblem = never>(
  value: Result<Value, Problem>,
  transform: (value: Value) => Result<Output, NextProblem>,
): Result<Output, Problem | NextProblem>;
export function flatMap<Value = never, Output = never>(
  value: Option<Value>,
  transform: (value: Value) => Option<Output>,
): Option<Output>;
export function flatMap<Value = never, Problem = never, Output = never, NextProblem = never>(
  value: AsyncResult<Value, Problem>,
  transform: (value: Value) => Result<Output, NextProblem> | AsyncResult<Output, NextProblem>,
): AsyncResult<Output, Problem | NextProblem>;
export function flatMap<Value, Problem, Output, NextProblem>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  transform: (
    value: Value,
  ) => Result<Output, NextProblem> | Option<Output> | AsyncResult<Output, NextProblem>,
):
  | Result<Output, Problem | NextProblem>
  | Option<Output>
  | Promise<Result<Output, Problem | NextProblem> | Option<Output>> {
  if ('then' in value)
    return value.then((result) => (isOk(result) ? transform(get(result)) : result));
  if (isResult(value)) return isOk(value) ? transform(get(value)) : value;
  return isSome(value) ? transform(get(value)) : value;
}

/**
 * Transform the problem of a failed result, leaving success untouched.
 *
 * @param value - A `Result` or `AsyncResult`.
 * @param transform - Called only with the problem; the returned problem replaces it.
 * @returns The same result with the mapped problem.
 */
export function mapError<Value = never, Problem = never, NextProblem = never>(
  value: Ok<Value>,
  transform: (error: Problem) => Synchronous<NextProblem>,
): Ok<Value>;
export function mapError<Problem, NextProblem>(
  value: Err<Problem>,
  transform: (error: Problem) => Synchronous<NextProblem>,
): Err<NextProblem>;
export function mapError<Value = never, Problem = never, NextProblem = never>(
  value: Result<Value, Problem>,
  transform: (error: Problem) => Synchronous<NextProblem>,
): Result<Value, NextProblem>;
export function mapError<Value = never, Problem = never, NextProblem = never>(
  value: AsyncResult<Value, Problem>,
  transform: (error: Problem) => NextProblem,
): AsyncResult<Value, Awaited<NextProblem>>;
export function mapError<Value, Problem, NextProblem>(
  value: Result<Value, Problem> | AsyncResult<Value, Problem>,
  transform: (error: Problem) => NextProblem,
): Result<Value, NextProblem> | AsyncResult<Value, Awaited<NextProblem>> {
  if ('then' in value)
    return value.then(async (result) =>
      isErr(result) ? err(await transform(getError(result))) : result,
    );
  return isErr(value) ? err(transform(getError(value))) : value;
}

/**
 * Keep the original success container once `check` accepts it. Unlike `flatMap`, the
 * successful branch never rebuilds the value, so callers can add a validation step to an
 * existing pipeline without restating the payload.
 */
export function andThrough<In, NextProblem>(
  value: Ok<In>,
  check: (value: In) => Result<unknown, NextProblem>,
): Result<In, NextProblem>;
export function andThrough<In = never, Problem = never, NextProblem = never>(
  value: Err<Problem>,
  check: (value: In) => Result<unknown, NextProblem>,
): Err<Problem>;
export function andThrough<In, Problem, NextProblem>(
  value: Result<In, Problem>,
  check: (value: In) => Result<unknown, NextProblem>,
): Result<In, Problem | NextProblem>;
export function andThrough<In, Problem, NextProblem>(
  value: Result<In, Problem>,
  check: (value: In) => Result<unknown, NextProblem>,
): Result<In, Problem | NextProblem> {
  if (isErr(value)) return value;
  const checked = check(get(value));
  return isErr(checked) ? checked : value;
}
/**
 * Keep an `Option` only when the predicate accepts its value, otherwise report absence.
 *
 * For a `Result` the third argument converts a rejected value into a problem; it is required
 * there and must be omitted for an `Option`, where a rejection becomes `None`.
 *
 * @param value - The `Option` or `Result` to narrow.
 * @param predicate - Decides whether the payload survives; it may be a type guard.
 * @param onFalse - Only for a `Result`: maps the rejected payload to a new problem.
 * @returns The narrowed container, or `None`/`Err` when the predicate rejects.
 */
export function filter<Value, Narrow extends Value>(
  value: Option<Value>,
  predicate: (value: Value) => value is Narrow,
): Option<Narrow>;
export function filter<Value>(
  value: Option<Value>,
  predicate: (value: Value) => boolean,
): Option<Value>;
export function filter<Value, Problem, Narrow extends Value, NextProblem>(
  value: Result<Value, Problem>,
  predicate: (value: Value) => value is Narrow,
  onFalse: (value: Value) => NextProblem,
): Result<Narrow, Problem | NextProblem>;
export function filter<Problem, Value = never, NextProblem = never>(
  value: Err<Problem>,
  predicate: (value: Value) => boolean,
  onFalse: (value: Value) => NextProblem,
): Err<Problem>;
export function filter<Value, Problem, NextProblem>(
  value: Result<Value, Problem>,
  predicate: (value: Value) => boolean,
  onFalse: (value: Value) => NextProblem,
): Result<Value, Problem | NextProblem>;
export function filter<Value, Problem, NextProblem>(
  value: Option<Value> | Result<Value, Problem>,
  predicate: (value: Value) => boolean,
  ...failures: [] | [(value: Value) => NextProblem]
): Option<Value> | Result<Value, Problem | NextProblem> {
  // Dispatch on the container, never on the argument count: a rejected `Option` must become
  // `None` even when a caller also supplied the `Result` mapper.
  const onFalse = failures[0];
  if (!isResult(value)) return isSome(value) && predicate(get(value)) ? value : none();
  if (!isOk(value) || predicate(get(value))) return value;
  return onFalse ? err(onFalse(get(value))) : value;
}

/**
 * Return the first array element the predicate accepts.
 *
 * @param values - The array to search in order.
 * @param predicate - Receives each element; a type guard narrows the returned option.
 * @returns `Some` with the first match, or `None` when nothing matches.
 */
export function findValue<Value, Narrow extends Value>(
  values: readonly Value[],
  predicate: (value: Value) => value is Narrow,
): Option<Narrow>;
export function findValue<Value>(
  values: readonly Value[],
  predicate: (value: Value) => boolean,
): Option<Value>;
export function findValue<Value>(
  values: readonly Value[],
  predicate: (value: Value) => boolean,
): Option<Value> {
  for (const value of values) if (predicate(value)) return some(value);
  return none();
}

/**
 * Convert presence into success by naming the problem of absence.
 *
 * @param value - The option to convert.
 * @param onNone - Called with no argument only when the option is absent.
 * @returns `Ok` with the present value, or `Err` with the produced problem.
 */
export function toResult<Value, Problem>(value: Some<Value>, onNone: () => Problem): Ok<Value>;
export function toResult<Problem>(value: None, onNone: () => Problem): Err<Problem>;
export function toResult<Value, Problem>(
  value: Option<Value>,
  onNone: () => Problem,
): Result<Value, Problem>;
export function toResult<Value, Problem>(
  value: Option<Value>,
  onNone: () => Problem,
): Result<Value, Problem> {
  return isSome(value) ? ok(get(value)) : err(onNone());
}

/**
 * Run a `Result`-returning operation over an array in order, stopping at the first failure.
 *
 * @param values - The array to visit.
 * @param operation - Receives each value and its index.
 * @returns `Ok` with every produced value in order, or the first `Err` unchanged.
 */
export const traverse = <Input = never, Output = never, Problem = never>(
  values: readonly Input[],
  operation: (value: Input, index: number) => Result<Output, Problem>,
): Result<readonly Output[], Problem> => {
  const collected: Output[] = [];
  for (const [index, value] of values.entries()) {
    const result = operation(value, index);
    if (isErr(result)) return result;
    collected.push(get(result));
  }
  return ok(collected);
};

/** A deferred cleanup failure, reported instead of replacing the primary outcome silently. */
export type CompletionIssue<Problem, CleanupProblem> = Readonly<{
  code: 'cleanup-failed';
  primary: Problem | CleanupProblem;
  operationError: Option<Problem>;
  cleanupErrors: readonly CleanupProblem[];
}>;

/**
 * Visit an array asynchronously in order, stopping at the first failure.
 *
 * @param values - The array to visit.
 * @param operation - Receives each value and its index; called sequentially.
 * @returns A promise of `Ok` with every produced value, or the first `Err` unchanged.
 */
export const traverseAsync = async <Input, Output, Problem = never>(
  values: readonly Input[],
  operation: (
    value: Input,
    index: number,
  ) => Result<Output, Problem> | PromiseLike<Result<Output, Problem>>,
): Promise<Result<readonly Output[], Problem>> => {
  const collected: Output[] = [];
  for (const [index, value] of values.entries()) {
    const result = await operation(value, index);
    if (isErr(result)) return result;
    collected.push(get(result));
  }
  return ok(collected);
};

/**
 * Combine a primary outcome with the outcomes of its cleanup steps.
 *
 * @param primary - The main operation's result.
 * @param cleanupResults - Every cleanup outcome, in the order it ran.
 * @returns The primary result when all cleanup succeeded, otherwise an `Err` describing the
 * cleanup failure; `project` may replace that issue with its own problem type.
 */
export function completeWithCleanup<Value = never, Problem = never, CleanupProblem = never>(
  primary: Result<Value, Problem>,
  cleanupResults: readonly Result<unknown, CleanupProblem>[],
): Result<Value, Problem | CompletionIssue<Problem, CleanupProblem>>;
export function completeWithCleanup<Value, Problem, CleanupProblem, Mapped>(
  primary: Result<Value, Problem>,
  cleanupResults: readonly Result<unknown, CleanupProblem>[],
  project: (issue: CompletionIssue<Problem, CleanupProblem>) => Synchronous<Mapped>,
): Result<Value, Problem | Mapped>;
export function completeWithCleanup<Value, Problem, CleanupProblem, Mapped>(
  ...argumentsList:
    | readonly [Result<Value, Problem>, readonly Result<unknown, CleanupProblem>[]]
    | readonly [
        Result<Value, Problem>,
        readonly Result<unknown, CleanupProblem>[],
        (issue: CompletionIssue<Problem, CleanupProblem>) => Synchronous<Mapped>,
      ]
): Result<Value, Problem | Mapped | CompletionIssue<Problem, CleanupProblem>> {
  const [primary, cleanupResults] = argumentsList;
  const cleanupErrors: CleanupProblem[] = [];
  let firstCleanup: Option<CleanupProblem> = none();
  for (const result of cleanupResults) {
    if (isErr(result)) {
      const error = getError(result);
      cleanupErrors.push(error);
      if (isNone(firstCleanup)) firstCleanup = some(error);
    }
  }
  if (isNone(firstCleanup)) return primary;
  const issue: CompletionIssue<Problem, CleanupProblem> = {
    code: 'cleanup-failed',
    primary: isErr(primary) ? getError(primary) : get(firstCleanup),
    operationError: isErr(primary) ? some(getError(primary)) : none(),
    cleanupErrors: Object.freeze(cleanupErrors),
  };
  return err(argumentsList.length === 3 ? argumentsList[2](issue) : issue);
}
