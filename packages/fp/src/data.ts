import { err, get, getError, isOk, isSome, none, ok, some } from './containers.ts';
import type { Option, Result } from './containers.ts';

/** The explicit wire shape of a `Result`; wrappers publish no hidden fields. */
export type ResultData<Value, Problem> =
  | Readonly<{ status: 'ok'; value: Value }>
  | Readonly<{ status: 'error'; error: Problem }>;

/** The explicit wire shape of an `Option`, distinguishing absence from a stored `false`. */
export type OptionData<Value> =
  | Readonly<{ present: true; value: Value }>
  | Readonly<{ present: false }>;

// DTOs are deliberately explicit. Validate untrusted decoded data at the application boundary.
/**
 * Convert a result into its publishable DTO.
 *
 * @param value - The result to convert; the payload is copied, not decoded.
 * @returns The explicit DTO a serializer can write.
 */
export const toResultData = <Value, Problem>(
  value: Result<Value, Problem>,
): ResultData<Value, Problem> =>
  isOk(value) ? { status: 'ok', value: get(value) } : { status: 'error', error: getError(value) };

/**
 * Convert a result DTO back into a `Result`.
 *
 * @param value - A DTO that was already validated; the status field selects the variant.
 * @returns The equivalent `ok` or `err`.
 */
export const fromResultData = <Value, Problem>(
  value: ResultData<Value, Problem>,
): Result<Value, Problem> => (value.status === 'ok' ? ok(value.value) : err(value.error));

/**
 * Convert an option into its publishable DTO.
 *
 * @param value - The option to convert.
 * @returns `{present: true, value}` or `{present: false}`.
 */
export const toOptionData = <Value>(value: Option<Value>): OptionData<Value> =>
  isSome(value) ? { present: true, value: get(value) } : { present: false };

/**
 * Convert an option DTO back into an `Option`.
 *
 * @param value - A DTO that was already validated; `present` selects the variant.
 * @returns The equivalent `some` or `none`.
 */
export const fromOptionData = <Value>(value: OptionData<Value>): Option<Value> =>
  value.present ? some(value.value) : none();
