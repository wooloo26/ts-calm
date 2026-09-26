import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  hasOwn,
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isPlainObject,
  isString,
  isUndefined,
} from '@ts-calm/fp';

const guards = {
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isPlainObject,
  isString,
  isUndefined,
} as const;
type GuardName = keyof typeof guards;
const names = Object.keys(guards) as readonly GuardName[];

const cases: readonly (readonly [string, unknown, readonly GuardName[]])[] = [
  ['null', null, ['isNull']],
  ['undefined', undefined, ['isUndefined']],
  ['zero', 0, ['isNumber']],
  ['negative zero', -0, ['isNumber']],
  ['NaN', Number.NaN, []],
  ['Infinity', Number.POSITIVE_INFINITY, []],
  ['empty string', '', ['isString']],
  ['text', 'x', ['isString']],
  ['false', false, ['isBoolean']],
  ['true', true, ['isBoolean']],
  ['symbol', Symbol('s'), []],
  ['bigint', 1n, []],
  ['function', () => 1, []],
  ['array', [1], ['isArray', 'isObject']],
  ['dictionary', { a: 1 }, ['isObject', 'isPlainObject']],
  ['null prototype', Object.create(null), ['isObject', 'isPlainObject']],
  ['map', new Map(), ['isObject']],
  ['date', new Date(), ['isObject']],
  ['boxed string', new String('x'), ['isObject']],
  ['boxed number', new Number(1), ['isObject']],
  ['cross-realm object', runInNewContext('({a:1})'), ['isObject']],
];

describe('guard contract', () => {
  it('classifies every primitive and built-in exactly once per meaning', () => {
    for (const [label, value, expected] of cases)
      for (const name of names)
        expect(guards[name](value), `${name}(${label})`).toBe(expected.includes(name));
  });
  it('treats null and undefined as distinct sentinels', () => {
    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(false);
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
  });
  it('fails closed for revoked and uninspectable proxies', () => {
    const revoked = Proxy.revocable([1], {});
    revoked.revoke();
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('denied');
        },
        getOwnPropertyDescriptor() {
          throw new Error('denied');
        },
        get() {
          throw new Error('denied');
        },
      },
    );
    for (const value of [revoked.proxy, hostile])
      for (const name of names) expect(guards[name](value), `${name}(hostile)`).toBe(false);
    expect(hasOwn(hostile, 'x')).toBe(false);
    expect(hasOwn(revoked.proxy, 'length')).toBe(false);
  });
  it('never reports a value as a container of another kind', () => {
    const containers = [[], {}, new Map(), new Date(), () => 1];
    for (const value of containers) expect(isNull(value), 'isNull(container)').toBe(false);
    expect(isArray(new Uint8Array(1))).toBe(false);
    expect(isArray(new Map())).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isPlainObject(Object.create({ a: 1 }))).toBe(false);
  });
});
