import { describe, expect, test, vi } from 'vitest';
import { capture, captureAsync } from '#fp/boundary';
import {
  decodeJson,
  encodeJson,
  err,
  formatDiagnostic,
  get,
  getError,
  isErr,
  none,
  ok,
  some,
  unit,
} from '#fp/index';
import type { JsonCodec, JsonValue, Unit } from '#fp/index';
import {
  invalidJsonFixture,
  missingJsonOutputFixture,
  nullPrototypeFixture,
  raise,
  sparseArrayFixture,
} from '#fixtures/fp/foundation';

describe('classified external failures', () => {
  test('invokes lazy operations once and preserves known expected failures', async () => {
    const operation = vi.fn(() => 42);
    const classify = vi.fn(() => none());
    expect(capture(operation, { name: 'read', classify })).toEqual(ok(42));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(classify).not.toHaveBeenCalled();
    expect(
      capture(() => raise('missing'), { name: 'read', classify: () => some('not-found') }),
    ).toEqual(err('not-found'));
    expect(await captureAsync(async () => 42, { name: 'read', classify })).toEqual(ok(42));
    expect(
      await captureAsync(() => raise('missing'), {
        name: 'read',
        classify: () => some('not-found'),
      }),
    ).toEqual(err('not-found'));
    expect(
      await captureAsync(() => Promise.reject('missing'), {
        name: 'read',
        classify: () => some('not-found'),
      }),
    ).toEqual(err('not-found'));
    expect(capture(() => err('expected'), { name: 'call', classify })).toEqual(ok(err('expected')));
  });
  test('preserves unknown causes as Faults rather than expected failures', async () => {
    const causes: readonly unknown[] = [new Error('native defect'), 'native defect', 42];
    for (const cause of causes) {
      const result = capture(() => raise(cause), { name: 'read-file', classify: () => none() });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(getError(result).code).toBe('unexpected-fault');
        expect(getError(result).operation).toBe('read-file');
        expect(getError(result).cause).toBe(cause);
      }
      const asyncResult = await captureAsync(() => Promise.reject(cause), {
        name: 'read-file',
        classify: () => none(),
      });
      expect(asyncResult).toEqual(result);
    }
  });
  test('records classifier defects and safely describes uninspectable thrown objects', () => {
    const classifierDefect = new Error('bad classifier');
    const result = capture(() => raise('initial'), {
      name: 'read',
      classify: () => raise(classifierDefect),
    });
    expect(result).toEqual(
      err({
        code: 'unexpected-fault',
        operation: 'read.classify',
        message: 'bad classifier',
        cause: classifierDefect,
      }),
    );
    const uninspectable = new Proxy({}, { getPrototypeOf: () => raise('inspect failed') });
    const inspected = capture(() => raise(uninspectable), { name: 'read', classify: () => none() });
    expect(isErr(inspected)).toBe(true);
    if (isErr(inspected)) {
      expect(getError(inspected).message).toBe('Uninspectable failure');
      expect(getError(inspected).cause).toBe(uninspectable);
    }
  });
});

const numberCodec: JsonCodec<number, string> = {
  encode: (value) => ({ number: value }),
  decode: (input) =>
    input instanceof Object && 'number' in input && typeof input.number === 'number'
      ? ok(input.number)
      : err('invalid-number'),
};
const unsafeCodec: JsonCodec<unknown, string> = {
  encode: invalidJsonFixture,
  decode: (input) => ok(input),
};

describe('explicit JSON contracts', () => {
  test('round-trips DTOs and validates parsed input with the supplied codec', () => {
    expect(encodeJson(2, numberCodec)).toEqual(ok('{"number":2}'));
    expect(decodeJson('{"number":2}', numberCodec)).toEqual(ok(2));
    expect(decodeJson('{"number":"two"}', numberCodec)).toEqual(err('invalid-number'));
    expect(isErr(decodeJson('{', numberCodec))).toBe(true);
    expect(isErr(decodeJson('1e400', unsafeCodec))).toBe(true);
    const nullable: JsonValue = JSON.parse('null');
    expect(encodeJson({ empty: nullable, list: [true, false, 'text', 2] }, unsafeCodec)).toEqual(
      ok('{"empty":null,"list":[true,false,"text",2]}'),
    );
    const shared = { value: 1 };
    expect(encodeJson([shared, shared], unsafeCodec)).toEqual(ok('[{"value":1},{"value":1}]'));
    const noPrototype = nullPrototypeFixture();
    expect(encodeJson(noPrototype, unsafeCodec)).toEqual(ok('{"value":1}'));
  });
  test('rejects values that native JSON would erase, coerce or interpret through toJSON', () => {
    const custom = vi.fn(() => 'hidden');
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const getter = vi.fn(() => 1);
    for (const value of [
      ok(1),
      some(1),
      none(),
      unit(),
      Symbol('value'),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      () => 1,
      new Map(),
      new Uint8Array([1]),
      cycle,
      Object.defineProperty({}, 'hidden', { value: 1 }),
      Object.defineProperty({}, 'value', { enumerable: true, get: getter }),
      { toJSON: custom },
      sparseArrayFixture(2),
      Object.setPrototypeOf([1], { toJSON: custom }),
      Object.defineProperty([1], 'hidden', { value: 2 }),
      Object.assign(sparseArrayFixture(1), { other: 1 }),
    ])
      expect(isErr(encodeJson(value, unsafeCodec))).toBe(true);
    expect(custom).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
  test('does not swallow codec defects and gives Unit an interface-owned representation', () => {
    const failure = new Error('codec defect');
    const codec: JsonCodec<number, string> = {
      encode: () => raise(failure),
      decode: () => raise(failure),
    };
    expect(() => encodeJson(1, codec)).toThrow(failure);
    expect(() => decodeJson('1', codec)).toThrow(failure);
    const unitCodec: JsonCodec<Unit, string> = {
      encode: () => 'complete',
      decode: (value) => (value === 'complete' ? ok() : err('invalid-completion')),
    };
    expect(encodeJson(unit(), unitCodec)).toEqual(ok('"complete"'));
    expect(decodeJson('"complete"', unitCodec)).toEqual(ok(unit()));
  });
  test('maps native JSON failures and keeps diagnostics explicitly separate', () => {
    const proxy = new Proxy({}, { ownKeys: () => raise('bad reflection') });
    expect(isErr(encodeJson(proxy, unsafeCodec))).toBe(true);
    const nativeFailure = new Proxy({}, { ownKeys: () => raise(new Error('bad reflection')) });
    expect(isErr(encodeJson(nativeFailure, unsafeCodec))).toBe(true);
    expect(formatDiagnostic(ok(some(1)))).toEqual(
      ok('{"status":"ok","value":{"present":true,"value":1}}'),
    );
    expect(isErr(formatDiagnostic({ toJSON: () => raise('bad native value') }))).toBe(true);
    const parsed = decodeJson('42', {
      encode: (value: number) => value,
      decode: () => err('expected-rejection'),
    });
    expect(parsed).toEqual(err('expected-rejection'));
    const native = vi
      .spyOn(JSON, 'parse')
      .mockImplementationOnce(() => raise('native parse failure'));
    expect(isErr(decodeJson('1', unsafeCodec))).toBe(true);
    native.mockRestore();
    const missing = missingJsonOutputFixture();
    const absent = vi.spyOn(JSON, 'stringify').mockReturnValueOnce(missing);
    expect(encodeJson(1, numberCodec)).toEqual(
      err({ code: 'serialization-failed', message: 'DTO has no JSON representation' }),
    );
    absent.mockRestore();
    const json = encodeJson(1, numberCodec);
    expect(isErr(json)).toBe(false);
    if (!isErr(json)) expect(get(json)).toContain('number');
  });
});
