import { describe, expect, it } from 'vitest';
import {
  at,
  filter,
  get,
  isErr,
  isNone,
  isOk,
  isSome,
  lookup,
  map,
  nonEmpty,
  ok,
  some,
} from '@ts-calm/fp';
import type { Option } from '@ts-calm/fp';

const filterOptionWithMapper = filter as unknown as (
  value: Option<number>,
  predicate: (value: number) => boolean,
  onFalse: (value: number) => string,
) => Option<number>;

const dictionaryWithMapMethods = {
  name: 'bob',
  get: () => 'ignored',
  has: () => false,
  *[Symbol.iterator]() {},
};

describe('container contract', () => {
  it('keeps a rejected option absent even when a Result mapper is supplied', () => {
    const rejected = filterOptionWithMapper(
      some(3),
      (value) => value % 2 === 0,
      () => 'odd',
    );
    const accepted = filterOptionWithMapper(
      some(4),
      (value) => value % 2 === 0,
      () => 'odd',
    );
    expect(isNone(rejected)).toBe(true);
    expect(isSome(accepted)).toBe(true);
    expect(isNone(filter(some(3), () => false))).toBe(true);
    const failed = filter(
      ok(3),
      (value) => value % 2 === 0,
      () => 'odd',
    );
    expect(isErr(failed)).toBe(true);
  });
  it('reads a dictionary that happens to expose map-like methods', () => {
    const found = lookup(dictionaryWithMapMethods, 'name');
    expect(isSome(found) && get(found)).toBe('bob');
    expect(isNone(lookup(dictionaryWithMapMethods, 'missing'))).toBe(true);
    const entries = new Map<string, number>([['a', 1]]);
    const entry = lookup(entries, 'a');
    expect(isSome(entry) && get(entry)).toBe(1);
    expect(isNone(lookup(entries, 'b'))).toBe(true);
  });
  it('rejects a non-empty array whose first element is a hole', () => {
    const sparse: number[] = [];
    sparse.length = 3;
    expect(isNone(nonEmpty(sparse))).toBe(true);
    expect(isNone(at(sparse, 0))).toBe(true);
    expect(isNone(nonEmpty([]))).toBe(true);
    expect(isSome(nonEmpty([0]))).toBe(true);
  });
  it('inspects the container, not a thenable payload', () => {
    const pending: PromiseLike<number> = Promise.resolve(1);
    expect(isSome(map(some(pending), () => 'mapped'))).toBe(true);
    expect(isOk(map(ok(pending), () => 'mapped'))).toBe(true);
  });
});
