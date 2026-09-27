import { expect, it, vi } from 'vitest';
import { capture, captureAsync } from '@ts-calm/fp/boundary';
import { decodeJson, encodeJson, formatDiagnostic, getError, isErr, ok } from '@ts-calm/fp';

it.each([42, null, undefined, {}, Symbol('message'), () => 1])(
  'normalizes a non-string Error.message (%s)',
  async (message) => {
    const cause = new Error('original');
    Object.defineProperty(cause, 'message', { value: message });
    const synchronous = capture(
      () => {
        throw cause;
      },
      { name: 'sync' },
    );
    const asynchronous = await captureAsync(() => Promise.reject(cause), { name: 'async' });
    for (const result of [synchronous, asynchronous]) {
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(typeof getError(result).message).toBe('string');
        expect(getError(result).cause).toBe(cause);
      }
    }
  },
);
it('reads the message once and preserves an ordinary string verbatim', () => {
  let reads = 0;
  const cause = Object.defineProperty(new Error(), 'message', {
    get: () => {
      reads += 1;
      return 'message';
    },
  });
  const result = capture(
    () => {
      throw cause;
    },
    { name: 'read' },
  );
  expect(isErr(result)).toBe(true);
  if (isErr(result)) expect(getError(result).message).toBe('message');
  expect(reads).toBe(1);
});

it('keeps normalized messages when converting captured faults into JSON issues', () => {
  const cause = Object.defineProperty(new Error(), 'message', {
    get: () => {
      throw new Error('message getter failed');
    },
  });
  vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
    throw cause;
  });
  const decoded = decodeJson<unknown, never>('1', {
    decode: (value: unknown) => ok(value),
    encode: () => 1,
  });
  const reflected = new Proxy(
    {},
    {
      ownKeys: () => {
        throw cause;
      },
    },
  );
  const encoded = encodeJson(reflected, { decode: ok, encode: () => reflected });
  const formatted = formatDiagnostic({
    toJSON: () => {
      throw cause;
    },
  });
  for (const result of [decoded, encoded, formatted]) {
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(getError(result).message).toBe('Uninspectable failure');
  }
});
