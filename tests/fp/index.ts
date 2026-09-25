import { describe, expect, test, vi } from 'vitest';
import { assert, integer, property } from 'fast-check';
import {
  all,
  err,
  filter,
  findValue,
  flatMap,
  fromOptionData,
  fromResultData,
  get,
  getError,
  getOrElse,
  isErr,
  isNone,
  isOk,
  isOption,
  isResult,
  isSome,
  map,
  mapError,
  match,
  none,
  ok,
  orElse,
  some,
  formatDiagnostic,
  toOptionData,
  toResultData,
  unit,
} from '#fp/index';
import type { Option, Result } from '#fp/index';
import { structuralLookalike } from '#fixtures/fp/foundation';

describe('opaque functional containers', () => {
  test('uses Unit for a successful operation without a value', () => {
    expect(ok()).toEqual(ok(unit()));
  });
  test('keeps representation private and containers immutable', () => {
    for (const container of [ok(1), err('failure'), some(1), none(), unit()]) {
      expect(Object.keys(container)).toEqual([]);
      expect(Object.isFrozen(container)).toBe(true);
      expect(container).not.toHaveProperty('kind');
      expect(container).not.toHaveProperty('value');
      expect(container).not.toHaveProperty('error');
    }
    expect(none()).toBe(none());
    expect(unit()).toBe(unit());
    expect(ok(2)).toEqual(ok(2));
    expect(ok(2)).not.toEqual(ok(3));
    expect(ok(2)).not.toEqual(some(2));
    expect(err('failed')).not.toEqual(ok('failed'));
  });

  test('recognizes variants with predicates and rejects lookalikes', () => {
    expect(isOk(ok(0))).toBe(true);
    expect(isErr(err(false))).toBe(true);
    expect(isSome(some(''))).toBe(true);
    expect(isNone(none())).toBe(true);
    expect(isResult(ok(1))).toBe(true);
    expect(isResult(err('failed'))).toBe(true);
    expect(isOption(some(1))).toBe(true);
    expect(isOption(none())).toBe(true);
    expect(isResult(some(1))).toBe(false);
    expect(isOption(ok(1))).toBe(false);
    for (const value of [
      structuralLookalike,
      { status: 'ok', value: 1 },
      0,
      '',
      false,
      [],
      unit(),
    ]) {
      expect(isOk(value)).toBe(false);
      expect(isErr(value)).toBe(false);
      expect(isSome(value)).toBe(false);
      expect(isNone(value)).toBe(false);
      expect(isResult(value)).toBe(false);
      expect(isOption(value)).toBe(false);
    }
  });

  test('reads only successful and present values through safe accessors', () => {
    expect(get(ok(0))).toBe(0);
    expect(get(some(false))).toBe(false);
    expect(getError(err('failed'))).toBe('failed');
    const inspected: unknown = some(7);
    expect(isSome(inspected) ? get(inspected) : 'absent').toBe(7);
  });
});

describe('shared combinators', () => {
  test('matches every variant and calls only its matching handler', () => {
    const resultCases = {
      ok: vi.fn((value: number) => value + 1),
      err: vi.fn((error: string) => error.length),
    };
    expect(match(ok(2), resultCases)).toBe(3);
    expect(resultCases.err).not.toHaveBeenCalled();
    expect(match(err('failed'), resultCases)).toBe(6);
    expect(resultCases.ok).toHaveBeenCalledTimes(1);
    const optionCases = { some: vi.fn((value: number) => value + 1), none: vi.fn(() => 'missing') };
    expect(match(some(0), optionCases)).toBe(1);
    expect(optionCases.none).not.toHaveBeenCalled();
    expect(match(none(), optionCases)).toBe('missing');
    expect(optionCases.some).toHaveBeenCalledTimes(1);
  });

  test('maps successes and present values without invoking skipped transforms', () => {
    const transform = vi.fn((value: number) => value * 3);
    expect(map(ok(2), transform)).toEqual(ok(6));
    expect(map(some(2), transform)).toEqual(some(6));
    expect(map(err('failed'), transform)).toEqual(err('failed'));
    expect(map(none(), transform)).toBe(none());
    expect(transform).toHaveBeenCalledTimes(2);
    expect(mapError(err('failed'), (error) => error.length)).toEqual(err(6));
    const recover = vi.fn(() => 'unused');
    expect(mapError(ok(2), recover)).toEqual(ok(2));
    expect(recover).not.toHaveBeenCalled();
  });

  test('flat-maps within each container family and short-circuits', () => {
    expect(flatMap(ok(2), (value) => ok(value + 1))).toEqual(ok(3));
    expect(flatMap(ok(2), () => err('rejected'))).toEqual(err('rejected'));
    expect(flatMap(some(2), (value) => some(value + 1))).toEqual(some(3));
    expect(flatMap(some(2), () => none())).toBe(none());
    const nextResult = vi.fn(() => ok(1));
    const nextOption = vi.fn(() => some(1));
    expect(flatMap(err('failed'), nextResult)).toEqual(err('failed'));
    expect(flatMap(none(), nextOption)).toBe(none());
    expect(nextResult).not.toHaveBeenCalled();
    expect(nextOption).not.toHaveBeenCalled();
  });

  test('evaluates recovery and fallback lazily, with the original error', () => {
    const fallback = vi.fn((error: string) => error.length);
    expect(getOrElse(ok(2), fallback)).toBe(2);
    expect(fallback).not.toHaveBeenCalled();
    expect(getOrElse(err('failed'), fallback)).toBe(6);
    expect(fallback).toHaveBeenCalledWith('failed');
    const absent = vi.fn(() => 5);
    expect(getOrElse(some(0), absent)).toBe(0);
    expect(absent).not.toHaveBeenCalled();
    expect(getOrElse(none(), absent)).toBe(5);
    expect(absent).toHaveBeenCalledWith();
    const recoverResult = vi.fn((error: string) => ok(error.length));
    expect(orElse(ok(2), recoverResult)).toEqual(ok(2));
    expect(recoverResult).not.toHaveBeenCalled();
    expect(orElse(err('failed'), recoverResult)).toEqual(ok(6));
    expect(orElse(err('failed'), () => err(4))).toEqual(err(4));
    const recoverOption = vi.fn(() => some(7));
    expect(orElse(some(2), recoverOption)).toEqual(some(2));
    expect(recoverOption).not.toHaveBeenCalled();
    expect(orElse(none(), recoverOption)).toEqual(some(7));
    expect(orElse(none(), () => none())).toBe(none());
    expect(recoverOption).toHaveBeenCalledWith();
  });

  test('filters and searches without confusing false-like values with absence', () => {
    expect(filter(some(0), (value) => value === 0)).toEqual(some(0));
    expect(filter(some(0), (value) => value > 0)).toBe(none());
    const predicate = vi.fn(() => true);
    expect(filter(none(), predicate)).toBe(none());
    expect(predicate).not.toHaveBeenCalled();
    expect(findValue([0, 1], (value) => value === 0)).toEqual(some(0));
    expect(findValue([0, 1], (value) => value === 2)).toBe(none());
    expect(findValue([], predicate)).toBe(none());
    expect(predicate).not.toHaveBeenCalled();
  });

  test('collects in order and returns the first failure without reading later items', () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([])).toEqual(ok([]));
    const failure = err('first');
    expect(all([ok(1), failure, err('second')])).toBe(failure);
    expect(all([ok(0), ok(false), ok('')])).toEqual(ok([0, false, '']));
  });

  test('obeys mapping and composition laws for both families', () => {
    assert(
      property(integer({ min: -1_000_000, max: 1_000_000 }), (value) => {
        const identity = (input: number): number => input;
        const increment = (input: number): number => input + 1;
        const double = (input: number): number => input * 2;
        const result: Result<number, string> = value < 0 ? err('negative') : ok(value);
        const option: Option<number> = value < 0 ? none() : some(value);
        expect(map(result, identity)).toEqual(result);
        expect(map(option, identity)).toEqual(option);
        expect(map(map(result, increment), double)).toEqual(
          map(result, (input) => double(increment(input))),
        );
        expect(map(map(option, increment), double)).toEqual(
          map(option, (input) => double(increment(input))),
        );
        expect(flatMap(result, ok)).toEqual(result);
        expect(flatMap(option, some)).toEqual(option);
        expect(flatMap(ok(value), (input) => ok(increment(input)))).toEqual(ok(increment(value)));
        expect(flatMap(some(value), (input) => some(increment(input)))).toEqual(
          some(increment(value)),
        );
      }),
    );
  });
});

describe('explicit serialization', () => {
  test('round-trips documented DTOs without publishing wrapper fields', () => {
    expect(toResultData(ok(2))).toEqual({ status: 'ok', value: 2 });
    expect(toResultData(err('failed'))).toEqual({ status: 'error', error: 'failed' });
    expect(fromResultData({ status: 'ok', value: 2 })).toEqual(ok(2));
    expect(fromResultData({ status: 'error', error: 'failed' })).toEqual(err('failed'));
    expect(toOptionData(some(false))).toEqual({ present: true, value: false });
    expect(toOptionData(none())).toEqual({ present: false });
    expect(fromOptionData({ present: true, value: false })).toEqual(some(false));
    expect(fromOptionData({ present: false })).toBe(none());
  });

  test('encodes nested containers only through the explicit JSON boundary', () => {
    expect(formatDiagnostic({ result: ok({ option: some([none(), err('failure')]) }) })).toEqual(
      ok(
        '{"result":{"status":"ok","value":{"option":{"present":true,"value":[{"present":false},{"status":"error","error":"failure"}]}}}}',
      ),
    );
    expect(formatDiagnostic(unit())).toEqual(ok('"Unit"'));
    expect(formatDiagnostic({ count: 2 }, 2)).toEqual(ok('{\n  "count": 2\n}'));
    expect(formatDiagnostic('plain')).toEqual(ok('"plain"'));
    expect(isErr(formatDiagnostic(1n))).toBe(true);
    expect(isErr(formatDiagnostic(Symbol('not-json')))).toBe(true);
    const cycle: { next?: unknown } = {};
    cycle.next = cycle;
    expect(isErr(formatDiagnostic(cycle))).toBe(true);
  });
});
