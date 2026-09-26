/**
 * @boundary Validate external JSON data and turn native serialization failures into explicit results.
 * @allow strict-fp/no-null -- Null is a real JSON scalar and a valid dictionary prototype.
 * @allow strict-fp/no-try -- Normalize native serialization and reflection failures.
 * @allow strict-fp/no-undefined -- Detect missing native diagnostic output explicitly.
 */
import { err, get, isErr, isOption, isResult, ok, unit } from './containers.ts';
import type { Result, Unit } from './containers.ts';
import { toOptionData, toResultData } from './data.ts';
import type { Codec } from './contracts.ts';

/** A value that survives a JSON round trip: no `undefined`, cycles or non-finite numbers. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;
/** A codec whose data form is a JSON value; use with {@link encodeJson} and {@link decodeJson}. */
export type JsonCodec<Value, Problem> = Codec<Value, JsonValue, Problem>;
/** Why a JSON conversion failed: unparseable text, a non-JSON payload, or a serialization fault. */
export type JsonIssue = Readonly<{
  code: 'invalid-json' | 'invalid-json-value' | 'serialization-failed';
  message: string;
}>;

type PendingValue = Readonly<{ value: unknown; leaving: boolean }>;
const checkJsonValue = (input: unknown): Result<Unit, JsonIssue> => {
  const pending: PendingValue[] = [{ value: input, leaving: false }];
  const ancestors = new Set<object>();
  for (let next = pending.pop(); next; next = pending.pop()) {
    const value = next.value;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value !== 'object')
      return err({ code: 'invalid-json-value', message: 'DTO contains a non-JSON scalar' });
    if (next.leaving) {
      ancestors.delete(value);
      continue;
    }
    if (ancestors.has(value))
      return err({ code: 'invalid-json-value', message: 'DTO contains a cycle' });
    if (Object.getOwnPropertySymbols(value).length > 0)
      return err({
        code: 'invalid-json-value',
        message: 'DTO contains private or symbol-keyed state',
      });
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      Array.isArray(value)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      return err({
        code: 'invalid-json-value',
        message: 'DTO must contain plain objects and arrays',
      });
    ancestors.add(value);
    pending.push({ value, leaving: true });
    const keys = Object.keys(value);
    if (
      Array.isArray(value)
        ? keys.length !== value.length ||
          Object.getOwnPropertyNames(value).length !== keys.length + 1 ||
          keys.some((key, index) => key !== String(index))
        : Object.getOwnPropertyNames(value).length !== keys.length
    )
      return err({
        code: 'invalid-json-value',
        message: 'DTO contains holes or nonenumerable state',
      });
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value'))
        return err({ code: 'invalid-json-value', message: 'DTO accessors cannot be serialized' });
      const child: unknown = descriptor.value;
      pending.push({ value: child, leaving: false });
    }
  }
  return ok();
};

const serializeDto = (value: JsonValue): Result<string, JsonIssue> => {
  try {
    const checked = checkJsonValue(value);
    if (isErr(checked)) return checked;
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string'
      ? ok(encoded)
      : err({ code: 'serialization-failed', message: 'DTO has no JSON representation' });
  } catch (cause) {
    return err({
      code: 'serialization-failed',
      message: cause instanceof Error ? cause.message : 'JSON serialization failed',
    });
  }
};

/**
 * Encode a value through its codec and serialize it as JSON text.
 *
 * @param value - The domain value to write.
 * @param codec - Supplies the DTO shape; the DTO is validated before serialization.
 * @returns `Ok` with compact JSON text, or `Err` with the JSON issue.
 */
export const encodeJson = <Value, Problem>(
  value: Value,
  codec: JsonCodec<Value, Problem>,
): Result<string, JsonIssue> => serializeDto(codec.encode(value));

const parseJson = (text: string): Result<unknown, JsonIssue> => {
  try {
    const value: unknown = JSON.parse(text);
    const checked = checkJsonValue(value);
    return isErr(checked) ? checked : ok(value);
  } catch (cause) {
    return err({
      code: 'invalid-json',
      message: cause instanceof Error ? cause.message : 'JSON parsing failed',
    });
  }
};

/**
 * Parse JSON text, check that it only contains JSON values, then decode it.
 *
 * @param text - The JSON text to parse; invalid text is a returned failure, not a throw.
 * @param codec - Decodes the parsed value into the domain type.
 * @returns `Ok` with the decoded value, or `Err` with a JSON issue or the codec's problem.
 */
export const decodeJson = <Value, Problem>(
  text: string,
  codec: JsonCodec<Value, Problem>,
): Result<Value, Problem | JsonIssue> => {
  const parsed = parseJson(text);
  return isErr(parsed) ? parsed : codec.decode(get(parsed));
};

/**
 * Render any diagnostic value as readable JSON text.
 *
 * @param value - The value to render; nested containers become DTOs and errors keep their fields.
 * @param space - Indentation width passed to `JSON.stringify`; omit for compact output.
 * @returns `Ok` with the text, or `Err` for a cycle or an unrepresentable value.
 */
export const formatDiagnostic = (value: unknown, space?: number): Result<string, JsonIssue> => {
  try {
    const encoded = JSON.stringify(
      value,
      (_key: string, item: unknown) => {
        if (isResult(item)) return toResultData(item);
        if (isOption(item)) return toOptionData(item);
        if (item === unit()) return 'Unit';
        if (item instanceof Error) {
          const properties: Readonly<Record<string, unknown>> = Object.fromEntries(
            Object.entries(item),
          );
          return {
            ...properties,
            name: item.name,
            message: item.message,
            ...(typeof item.stack === 'string' ? { stack: item.stack } : {}),
            ...(Object.hasOwn(item, 'cause') ? { cause: item.cause } : {}),
          };
        }
        return item;
      },
      space,
    );
    return encoded === undefined
      ? err({ code: 'serialization-failed', message: 'The value has no JSON representation' })
      : ok(encoded);
  } catch (cause) {
    return err({
      code: 'serialization-failed',
      message: cause instanceof Error ? cause.message : 'JSON serialization failed',
    });
  }
};
