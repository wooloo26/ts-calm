import { describe, expect, expectTypeOf, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { isArray, isObject, isPlainObject, hasOwn } from '#fp/index';

describe('external value guards', () => {
  it('distinguishes arrays, objects and current-realm plain dictionaries', () => {
    class Example {
      value = 1;
    }
    expect(isArray([1])).toBe(true);
    expect(isArray(new Uint8Array(1))).toBe(false);
    for (const value of [[], {}, new Map(), new Date(), new Example()])
      expect(isObject(value)).toBe(true);
    for (const value of [null, undefined, 1, '', true, Symbol(), () => 1])
      expect(isObject(value)).toBe(false);
    for (const value of [{}, Object.create(null)]) expect(isPlainObject(value)).toBe(true);
    for (const value of [[], new Map(), new Date(), new Example(), runInNewContext('({a:1})')])
      expect(isPlainObject(value)).toBe(false);
  });
  it('returns false for revoked or uninspectable proxies', () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    for (const guard of [isArray, isObject, isPlainObject])
      expect(guard(revoked.proxy)).toBe(false);
    expect(hasOwn(revoked.proxy, 'length')).toBe(false);
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('denied');
        },
      },
    );
    expect(isObject(hostile)).toBe(false);
    expect(isPlainObject(hostile)).toBe(false);
    expect(hasOwn(hostile, 'x')).toBe(false);
  });
  it('checks own string, numeric and symbol keys without reading getters', () => {
    let reads = 0;
    const symbol = Symbol('key');
    const value = {
      get name() {
        reads += 1;
        return 'value';
      },
      4: 'four',
      [symbol]: true,
    };
    expect(hasOwn(value, 'name')).toBe(true);
    expect(reads).toBe(0);
    expect(hasOwn(value, 4)).toBe(true);
    expect(hasOwn(value, symbol)).toBe(true);
    expect(hasOwn(Object.create(value), 'name')).toBe(false);
    expect(hasOwn({ missing: undefined }, 'missing')).toBe(true);
    expect(hasOwn(null, 'x')).toBe(false);
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('denied');
        },
      },
    );
    expect(hasOwn(hostile, 'x')).toBe(false);
  });
  it('narrows only the shape proved by the guard', () => {
    const array: unknown = [1];
    if (isArray(array)) {
      expectTypeOf(array).toEqualTypeOf<readonly unknown[]>();
      // @ts-expect-error no element type has been validated
      const numeric: readonly number[] = array;
      void numeric;
    }
    const value: unknown = { name: 'reader' };
    if (isObject(value)) expectTypeOf(value).toEqualTypeOf<object>();
    if (isPlainObject(value))
      expectTypeOf(value).toEqualTypeOf<Readonly<Record<string, unknown>>>();
    if (hasOwn(value, 'name')) {
      expectTypeOf(value.name).toEqualTypeOf<unknown>();
      // @ts-expect-error property existence does not prove a string payload
      const name: string = value.name;
      void name;
    }
    const checkUnion = (key: 'a' | 'b', candidate: unknown): void => {
      if (hasOwn(candidate, key)) {
        // @ts-expect-error a union key does not prove both keys exist
        const both: Readonly<Record<'a' | 'b', unknown>> = candidate;
        void both;
      }
    };
    checkUnion('a', { a: 1 });
  });
});
