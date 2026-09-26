import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  err,
  get,
  isErr,
  isNone,
  isOk,
  isOption,
  isResult,
  isSome,
  lookup,
  none,
  ok,
  some,
} from '@ts-calm/fp';

it('recognizes only containers created by this module without inspecting hostile inputs', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error('prototype');
      },
      has() {
        throw new Error('has');
      },
      get() {
        throw new Error('get');
      },
    },
  );
  const guards = [isOk, isErr, isSome, isNone, isResult, isOption];
  const containers = [ok(1), err('failure'), some(1), none()];
  for (const guard of guards) {
    for (const value of [revoked.proxy, hostile, ...containers.map((value) => ({ ...value }))]) {
      expect(guard(value)).toBe(false);
    }
    for (const value of containers) {
      const symbol = Object.getOwnPropertySymbols(value)[0];
      if (symbol) expect(guard({ [symbol]: Reflect.get(value, symbol) })).toBe(false);
    }
  }
  expect(isOk(ok(1))).toBe(true);
  expect(isErr(err('failure'))).toBe(true);
  expect(isSome(some(1))).toBe(true);
  expect(isNone(none())).toBe(true);
});

it('reads a dictionary even when all map-like member names are present', () => {
  const record = {
    name: 'bob',
    size: 0,
    get: () => 'ignored',
    has: () => false,
    *[Symbol.iterator]() {},
  };
  const result = lookup(record, 'name');
  expect(isSome(result) && get(result)).toBe('bob');
});

it('recognizes native Maps across realms and preserves a stored undefined', () => {
  const foreign: ReadonlyMap<string, number> = runInNewContext('new Map([["value", 42]])');
  const result = lookup(foreign, 'value');
  expect(isSome(result) && get(result)).toBe(42);
  const entries = new Map<string, undefined>([['value', undefined]]);
  expect(isSome(lookup(entries, 'value'))).toBe(true);
  expect(isNone(lookup(entries, 'absent'))).toBe(true);
});
