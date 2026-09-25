import { err, get, getError, isOk, isSome, none, ok, some } from '#fp/containers';
import type { Option, Result } from '#fp/containers';

export type ResultData<Value, Problem> =
  | Readonly<{ status: 'ok'; value: Value }>
  | Readonly<{ status: 'error'; error: Problem }>;

export type OptionData<Value> =
  | Readonly<{ present: true; value: Value }>
  | Readonly<{ present: false }>;

// DTOs are deliberately explicit. Validate untrusted decoded data at the application boundary.
export const toResultData = <Value, Problem>(
  value: Result<Value, Problem>,
): ResultData<Value, Problem> =>
  isOk(value) ? { status: 'ok', value: get(value) } : { status: 'error', error: getError(value) };

export const fromResultData = <Value, Problem>(
  value: ResultData<Value, Problem>,
): Result<Value, Problem> => (value.status === 'ok' ? ok(value.value) : err(value.error));

export const toOptionData = <Value>(value: Option<Value>): OptionData<Value> =>
  isSome(value) ? { present: true, value: get(value) } : { present: false };

export const fromOptionData = <Value>(value: OptionData<Value>): Option<Value> =>
  value.present ? some(value.value) : none();
