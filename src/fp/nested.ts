import { get, isErr, isNone, isResult, isSome, none, ok, some } from './containers.ts';
import type { Err, None, Ok, Option, Result, Some } from './containers.ts';

export function flatten<Next extends Result<unknown, unknown>>(value: Ok<Next>): Next;
export function flatten<Problem>(value: Err<Problem>): Err<Problem>;
export function flatten<Next extends Option<unknown>>(value: Some<Next>): Next;
export function flatten(value: None): None;
export function flatten<Value, Problem, InnerProblem>(
  value: Result<Result<Value, InnerProblem>, Problem>,
): Result<Value, Problem | InnerProblem>;
export function flatten<Value>(value: Option<Option<Value>>): Option<Value>;
export function flatten<Value, Problem, InnerProblem>(
  value: Result<Result<Value, InnerProblem>, Problem> | Option<Option<Value>>,
): Result<Value, Problem | InnerProblem> | Option<Value> {
  return isErr(value) || isNone(value) ? value : get(value);
}

export function transpose(value: None): Ok<None>;
export function transpose<Value>(value: Some<Ok<Value>>): Ok<Some<Value>>;
export function transpose<Problem>(value: Some<Err<Problem>>): Err<Problem>;
export function transpose<Problem>(value: Err<Problem>): Some<Err<Problem>>;
export function transpose(value: Ok<None>): None;
export function transpose<Value>(value: Ok<Some<Value>>): Some<Ok<Value>>;
export function transpose<Value, Problem>(
  value: Option<Result<Value, Problem>>,
): Result<Option<Value>, Problem>;
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
