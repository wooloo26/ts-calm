import { get, getError, isErr, isOk, isSome } from './containers.ts';
import type { AsyncResult, Err, None, Ok, Option, Result, Some } from './containers.ts';

type Observation<Output> = Output & ([Output] extends [void] ? unknown : never);
type AsyncObservation<Output> = Output & ([Awaited<Output>] extends [void] ? unknown : never);

/**
 * Observe a present payload and return the container unchanged.
 *
 * The observation must not return a value: use this for logging or debugging probes, not for
 * mapping.
 *
 * @param value - A `Result`, `Option` or `AsyncResult`; the observer runs only on success.
 * @param observe - Receives the payload; its return value is ignored and must be `void`.
 * @returns The same container, unmodified.
 */
export function inspect<Value, Output>(
  value: Ok<Value>,
  observe: (value: Value) => Observation<Output>,
): Ok<Value>;
export function inspect<Value, Output>(
  value: Some<Value>,
  observe: (value: Value) => Observation<Output>,
): Some<Value>;
export function inspect<Problem, Value = never, Output = never>(
  value: Err<Problem>,
  observe: (value: Value) => Observation<Output>,
): Err<Problem>;
export function inspect<Value = never, Output = never>(
  value: None,
  observe: (value: Value) => Observation<Output>,
): None;
export function inspect<Value, Problem, Output>(
  value: Result<Value, Problem>,
  observe: (value: Value) => Observation<Output>,
): Result<Value, Problem>;
export function inspect<Value, Output>(
  value: Option<Value>,
  observe: (value: Value) => Observation<Output>,
): Option<Value>;
export function inspect<Value = never, Problem = never, Output = never>(
  value: AsyncResult<Value, Problem>,
  observe: (value: Value) => AsyncObservation<Output>,
): AsyncResult<Value, Problem>;
export function inspect<Value, Problem>(
  value: Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem>,
  observe: (value: Value) => unknown,
): Result<Value, Problem> | Option<Value> | AsyncResult<Value, Problem> {
  if ('then' in value)
    return value.then(async (result) => {
      if (isOk(result)) await observe(get(result));
      return result;
    });
  if (isOk(value) || isSome(value)) observe(get(value));
  return value;
}

/**
 * Observe a failure and return the result unchanged.
 *
 * @param value - A `Result` or `AsyncResult`; the observer runs only on failure.
 * @param observe - Receives the problem; its return value is ignored and must be `void`.
 * @returns The same result, unmodified.
 */
export function inspectError<Problem, Output>(
  value: Err<Problem>,
  observe: (error: Problem) => Observation<Output>,
): Err<Problem>;
export function inspectError<Value, Problem = never, Output = never>(
  value: Ok<Value>,
  observe: (error: Problem) => Observation<Output>,
): Ok<Value>;
export function inspectError<Value, Problem, Output>(
  value: Result<Value, Problem>,
  observe: (error: Problem) => Observation<Output>,
): Result<Value, Problem>;
export function inspectError<Value = never, Problem = never, Output = never>(
  value: AsyncResult<Value, Problem>,
  observe: (error: Problem) => AsyncObservation<Output>,
): AsyncResult<Value, Problem>;
export function inspectError<Value, Problem>(
  value: Result<Value, Problem> | AsyncResult<Value, Problem>,
  observe: (error: Problem) => unknown,
): Result<Value, Problem> | AsyncResult<Value, Problem> {
  if ('then' in value)
    return value.then(async (result) => {
      if (isErr(result)) await observe(getError(result));
      return result;
    });
  if (isErr(value)) observe(getError(value));
  return value;
}
