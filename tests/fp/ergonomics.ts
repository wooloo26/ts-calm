import { describe, expect, it } from 'vitest';
import { array, assert, integer, property } from 'fast-check';
import {
  all,
  at,
  branded,
  err,
  filter,
  filterMap,
  findMap,
  flatten,
  get,
  getError,
  inspect,
  inspectError,
  isErr,
  isSome,
  lookup,
  nonEmpty,
  none,
  ok,
  some,
  transpose,
  validateAll,
} from '#src/index.ts';
import type { Decoder } from '#src/index.ts';
import { capture, captureAsync, captureResult, captureResultAsync } from '#src/boundary.ts';
import {
  raise,
  sparseArrayFixture,
  presentMissingFixture,
  inheritedRecordFixture,
} from '#fixtures/foundation.ts';

describe('checked branded values and presence', () => {
  const positive: Decoder<number, 'not-positive'> = (input) =>
    typeof input === 'number' && input > 0 ? ok(input) : err('not-positive');
  it('brands only validated values without changing their runtime representation', () => {
    const revision = branded('game.Revision', positive);
    expect(revision.parse(1)).toEqual(ok(1));
    expect(revision.parse('1')).toEqual(err('not-positive'));
    expect(Object.isFrozen(revision)).toBe(true);
    expect(Object.keys(revision)).toEqual(['parse']);
    expect(() => branded('broken', () => raise('decoder-defect')).parse(1)).toThrow(
      'decoder-defect',
    );
  });
  it('returns nonempty arrays only when a first position exists', () => {
    expect(nonEmpty([])).toEqual(none());
    const found = nonEmpty([1, 2]);
    if (!isSome(found)) expect.fail('Expected nonempty values');
    expect(get(found)[0]).toBe(1);
  });
  it('uses integer indices, supports negative positions and distinguishes holes from values', () => {
    const values = ['first', 'last'];
    expect(at(values, 0)).toEqual(some('first'));
    expect(at(values, -1)).toEqual(some('last'));
    expect(at(values, -2)).toEqual(some('first'));
    for (const index of [-3, 2, Number.NaN, Infinity, 0.5])
      expect(at(values, index)).toEqual(none());
    expect(at(sparseArrayFixture(2), 0)).toEqual(none());
    expect(isSome(at(presentMissingFixture(), 0))).toBe(true);
  });
  it('looks up actual map entries and own record keys rather than testing truthiness', () => {
    const dictionary = inheritedRecordFixture();
    expect(lookup(dictionary, 'own')).toEqual(some(0));
    expect(lookup(dictionary, 'inherited')).toEqual(none());
    expect(lookup(dictionary, 'absent')).toEqual(none());
    const key = Symbol('key');
    expect(lookup({ [key]: false }, key)).toEqual(some(false));
    expect(lookup({ constructor: 'own constructor' }, 'constructor')).toEqual(
      some('own constructor'),
    );
    const missing = presentMissingFixture()[0];
    expect(isSome(lookup({ missing }, 'missing'))).toBe(true);
    const map = new Map([
      ['zero', 0],
      ['missing', missing],
    ]);
    expect(lookup(map, 'zero')).toEqual(some(0));
    expect(isSome(lookup(map, 'missing'))).toBe(true);
    expect(lookup(map, 'absent')).toEqual(none());
    const facade: ReadonlyMap<string, unknown> = Object.freeze({
      size: map.size,
      get: map.get.bind(map),
      has: map.has.bind(map),
      keys: map.keys.bind(map),
      values: map.values.bind(map),
      entries: map.entries.bind(map),
      forEach: map.forEach.bind(map),
      [Symbol.iterator]: map[Symbol.iterator].bind(map),
    });
    expect(lookup(facade, 'zero')).toEqual(some(0));
    expect(lookup({ get: 1 }, 'get')).toEqual(some(1));
    expect(lookup({ get: (): void => {}, has: 1 }, 'has')).toEqual(some(1));
    const functionRecord = { get: (): void => {}, has: (): void => {} };
    expect(isSome(lookup(functionRecord, 'get'))).toBe(true);
  });
  it('agrees with positive and negative integer array indexing', () => {
    assert(
      property(array(integer()), integer(), (values, index) => {
        const normalized = index < 0 ? values.length + index : index;
        expect(at(values, index)).toEqual(
          normalized >= 0 && normalized < values.length ? some(values[normalized]) : none(),
        );
      }),
    );
  });
});

describe('container and validation composition', () => {
  it('flattens exactly one matching container without replacing inner objects', () => {
    const success = ok(1);
    const failure = err('failed');
    const present = some(1);
    expect(flatten(ok(success))).toBe(success);
    expect(flatten(ok(failure))).toBe(failure);
    expect(flatten(failure)).toBe(failure);
    expect(flatten(some(present))).toBe(present);
    expect(flatten(some(none()))).toEqual(none());
    expect(flatten(none())).toEqual(none());
    expect(flatten(ok(ok(ok(1))))).toEqual(ok(ok(1)));
  });
  it('transposes every absence and failure case and is its own inverse', () => {
    expect(transpose(none())).toEqual(ok(none()));
    expect(transpose(some(ok(1)))).toEqual(ok(some(1)));
    expect(transpose(some(err('failed')))).toEqual(err('failed'));
    expect(transpose(err('failed'))).toEqual(some(err('failed')));
    expect(transpose(ok(none()))).toEqual(none());
    expect(transpose(ok(some(1)))).toEqual(some(ok(1)));
    assert(
      property(integer(), (value) => {
        expect(transpose(transpose(some(ok(value))))).toEqual(some(ok(value)));
        expect(transpose(transpose(ok(some(value))))).toEqual(ok(some(value)));
      }),
    );
  });
  it('filterMap collects and findMap stops at the first present mapped value', () => {
    const visited: number[] = [];
    const choose = (value: number, index: number) => {
      visited.push(index);
      return value > 0 ? some(String(value)) : none();
    };
    expect(filterMap([-1, 2, 3], choose)).toEqual(['2', '3']);
    expect(visited).toEqual([0, 1, 2]);
    visited.length = 0;
    expect(findMap([-1, 2, 3], choose)).toEqual(some('2'));
    expect(visited).toEqual([0, 1]);
    expect(findMap([-1], choose)).toEqual(none());
    expect(findMap([], choose)).toEqual(none());
    expect(() => filterMap([1], () => raise('mapper-defect'))).toThrow('mapper-defect');
    expect(() => findMap([1], () => raise('mapper-defect'))).toThrow('mapper-defect');
  });
  it('preserves named and symbol keys without polluting object prototypes', () => {
    const key = Symbol('owned');
    const values = Object.fromEntries([
      ['__proto__', ok('safe')],
      ['ordinary', ok('value')],
      [key, ok('symbol')],
    ]);
    const result = all(values);
    if (isErr(result)) expect.fail('Unexpected validation error');
    expect(Object.getPrototypeOf(get(result))).toBe(Object.prototype);
    expect(Object.hasOwn(get(result), '__proto__')).toBe(true);
    expect(lookup(get(result), key)).toEqual(some('symbol'));
    expect(all({ first: err('first'), second: err('second') })).toEqual(err('first'));
    expect(all({})).toEqual(ok({}));
  });
  it('collects all independent failures in deterministic input order', () => {
    expect(validateAll([ok(1), err('first'), ok(2), err('second')])).toEqual(
      err(['first', 'second']),
    );
    expect(validateAll({ left: err('first'), center: ok(1), right: err('second') })).toEqual(
      err(['first', 'second']),
    );
    expect(validateAll([ok(1), ok('two')])).toEqual(ok([1, 'two']));
    expect(validateAll({ one: ok(1), two: ok('two') })).toEqual(ok({ one: 1, two: 'two' }));
    expect(validateAll([])).toEqual(ok([]));
    expect(validateAll({})).toEqual(ok({}));
    assert(
      property(array(integer()), (values) => {
        const results = values.map((value) => (value < 0 ? err(value) : ok(value)));
        const expected = values.filter((value) => value < 0);
        expect(validateAll(results)).toEqual(expected.length > 0 ? err(expected) : ok(values));
      }),
    );
  });
  it('constructs predicate failures only for rejected successes', () => {
    const observed: number[] = [];
    const failure = (value: number) => {
      observed.push(value);
      return 'rejected';
    };
    const original = err('original');
    expect(filter(original, () => raise('predicate ran'), failure)).toBe(original);
    expect(filter(ok(1), () => true, failure)).toEqual(ok(1));
    expect(observed).toEqual([]);
    expect(filter(ok(0), () => false, failure)).toEqual(err('rejected'));
    expect(observed).toEqual([0]);
    expect(() => filter(ok(1), () => raise('predicate-defect'), failure)).toThrow(
      'predicate-defect',
    );
    expect(() =>
      filter(
        ok(1),
        () => false,
        () => raise('error-defect'),
      ),
    ).toThrow('error-defect');
  });
});

describe('explicit boundary result capture and observation', () => {
  it('defaults unclassified exceptions to Fault without nesting returned Results', async () => {
    const returned = err('expected');
    expect(captureResult(() => returned, { name: 'sync' })).toBe(returned);
    expect(captureResult(() => ok(1), { name: 'sync' })).toEqual(ok(1));
    expect(await captureResultAsync(async () => returned, { name: 'async' })).toBe(returned);
    expect(await captureResultAsync(async () => ok(1), { name: 'async' })).toEqual(ok(1));
    for (const captured of [
      capture(() => raise('broken'), { name: 'sync' }),
      captureResult(() => raise('broken'), { name: 'sync' }),
      await captureAsync(async () => raise('broken'), { name: 'async' }),
      await captureResultAsync(async () => raise('broken'), { name: 'async' }),
      await captureResultAsync(() => raise('broken'), { name: 'invocation' }),
    ]) {
      if (!isErr(captured)) expect.fail('Expected captured fault');
      expect(getError(captured)).toMatchObject({ code: 'unexpected-fault', cause: 'broken' });
    }
    expect(
      captureResult(() => raise('expected'), { name: 'classified', classify: () => some('known') }),
    ).toEqual(err('known'));
  });
  it('observes only the matching branch and returns the original container', async () => {
    const values: unknown[] = [];
    const observe = (value: unknown): void => {
      values.push(value);
    };
    const success = ok(1);
    const failure = err('failed');
    const present = some(2);
    expect(inspect(success, observe)).toBe(success);
    expect(inspect(failure, observe)).toBe(failure);
    expect(inspect(present, observe)).toBe(present);
    expect(inspect(none(), observe)).toEqual(none());
    expect(inspectError(success, observe)).toBe(success);
    expect(inspectError(failure, observe)).toBe(failure);
    expect(values).toEqual([1, 2, 'failed']);
    values.length = 0;
    expect(
      await inspect(Promise.resolve(success), async (value) => {
        await Promise.resolve();
        observe(value);
      }),
    ).toBe(success);
    expect(await inspect(Promise.resolve(failure), observe)).toBe(failure);
    expect(await inspectError(Promise.resolve(success), observe)).toBe(success);
    expect(
      await inspectError(Promise.resolve(failure), async (error) => {
        await Promise.resolve();
        observe(error);
      }),
    ).toBe(failure);
    expect(values).toEqual([1, 'failed']);
    expect(() => inspect(success, () => raise('observer-defect'))).toThrow('observer-defect');
    expect(() => inspectError(failure, () => raise('observer-defect'))).toThrow('observer-defect');
    await expect(inspect(Promise.resolve(success), async () => raise('async-defect'))).rejects.toBe(
      'async-defect',
    );
    await expect(
      inspectError(Promise.resolve(failure), async () => raise('async-defect')),
    ).rejects.toBe('async-defect');
    await expect(inspect(Promise.reject('input-defect'), observe)).rejects.toBe('input-defect');
  });
});
