import { get, isErr, isNone, isResult, isSome, none, ok, some } from './containers.ts';
import type { Err, None, Ok, Option, Result, Some } from './containers.ts';

/**
 * Unwrap one container layer while keeping the outer variant.
 *
 * @param value - A nested `Result` or `Option`; the outer failure short-circuits unchanged.
 * @returns The inner container, or the outer `Err`/`None` when it already failed.
 */
export function flatten<Next extends Result<unknown, unknown>>(value: Ok<Next>): Next;
/** Flatten a failed `Result`; the outer failure is returned unchanged.
 *
 * @param value - The failed result.
 * @returns The same `Err`, carrying its original problem.
 */
export function flatten<Problem>(value: Err<Problem>): Err<Problem>;
/** Flatten a present `Option` around another `Option`.
 *
 * @param value - The present option whose payload is itself an option.
 * @returns The inner option.
 */
export function flatten<Next extends Option<unknown>>(value: Some<Next>): Next;
/** Flatten the absent `Option`; absence is returned unchanged.
 *
 * @param value - The absent option.
 * @returns The same `None` singleton.
 */
export function flatten(value: None): None;
/** Flatten a `Result` around another `Result`.
 *
 * @param value - The nested result.
 * @returns The inner result, or the outer `Err` when the outer layer failed.
 */
export function flatten<Value, Problem, InnerProblem>(
  value: Result<Result<Value, InnerProblem>, Problem>,
): Result<Value, Problem | InnerProblem>;
/** Flatten an `Option` around another `Option`.
 *
 * @param value - The nested option.
 * @returns The inner option, or `None`.
 */
export function flatten<Value>(value: Option<Option<Value>>): Option<Value>;
export function flatten<Value, Problem, InnerProblem>(
  value: Result<Result<Value, InnerProblem>, Problem> | Option<Option<Value>>,
): Result<Value, Problem | InnerProblem> | Option<Value> {
  return isErr(value) || isNone(value) ? value : get(value);
}

/**
 * Swap the layers of an `Option` and a `Result`.
 *
 * A present option around a failed result becomes a failed result; absence becomes
 * `ok(none())`, because a missing value is not an error by itself.
 *
 * @param value - An `Option<Result<Value, Problem>>` or a `Result<Option<Value>, Problem>`.
 * @returns The transposed container.
 * @example
 * ```ts
 * transpose(some(err('missing'))) // err('missing')
 * transpose(some(ok(1)))         // ok(some(1))
 * transpose(none())              // ok(none())
 * ```
 */
export function transpose(value: None): Ok<None>;
/** Transpose a present option around a successful result.
 *
 * @param value - The present option.
 * @returns The successful result around the option.
 */
export function transpose<Value>(value: Some<Ok<Value>>): Ok<Some<Value>>;
/** Transpose a present option around a failed result.
 *
 * @param value - The present option.
 * @returns The failed result, with the option discarded.
 */
export function transpose<Problem>(value: Some<Err<Problem>>): Err<Problem>;
/** Transpose a failed result into a present option around that failure.
 *
 * @param value - The failed result.
 * @returns A `Some` carrying the original `Err`.
 */
export function transpose<Problem>(value: Err<Problem>): Some<Err<Problem>>;
/** Transpose a successful result around absence.
 *
 * @param value - The successful result.
 * @returns The absent option, because the success carried no value.
 */
export function transpose(value: Ok<None>): None;
/** Transpose a successful result around a present option.
 *
 * @param value - The successful result.
 * @returns The present option around the successful result.
 */
export function transpose<Value>(value: Ok<Some<Value>>): Some<Ok<Value>>;
/** Transpose an option around a result.
 *
 * @param value - The option whose payload may be a result.
 * @returns A result whose payload is an option.
 */
export function transpose<Value, Problem>(
  value: Option<Result<Value, Problem>>,
): Result<Option<Value>, Problem>;
/** Transpose a result around an option.
 *
 * @param value - The result whose payload may be missing.
 * @returns An option whose payload is a result.
 */
export function transpose<Value, Problem>(
  value: Result<Option<Value>, Problem>,
): Option<Result<Value, Problem>>;
export function transpose<Value, Problem>(
  value: Option<Result<Value, Problem>> | Result<Option<Value>, Problem>,
): Result<Option<Value>, Problem> | Option<Result<Value, Problem>> {
  if (isResult(value)) {
    if (isErr(value)) return some(value);
    const option = get(value);
    return isSome(option) ? some(ok(get(option))) : none();
  }
  if (isNone(value)) return ok(none());
  const result = get(value);
  return isErr(result) ? result : ok(some(get(result)));
}
