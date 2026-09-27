import { get, getError, isErr, isOk } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { failureMessage } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';

export const success = <Value>(result: Result<Value, CheckFailure>): Value => {
  if (isErr(result)) throw new Error(`Expected Ok: ${failureMessage(getError(result))}`);
  return get(result);
};
export const failure = <Value>(result: Result<Value, CheckFailure>): CheckFailure => {
  if (isOk(result)) throw new Error('Expected Err, received Ok.');
  return getError(result);
};
export const failureText = <Value>(result: Result<Value, CheckFailure>): string =>
  failureMessage(failure(result));
