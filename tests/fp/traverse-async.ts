import { expect, expectTypeOf, it } from 'vitest';
import { err, get, getError, isErr, isOk, ok, traverseAsync } from '../../src/fp/index.ts';
import type { Result } from '../../src/fp/index.ts';

it('awaits one operation at a time and preserves order without mutating the input', async () => {
  const input = Object.freeze([1, 2, 3]);
  const events: string[] = [];
  const result = await traverseAsync(input, async (value, index) => {
    events.push(`start:${index}`);
    await Promise.resolve();
    events.push(`end:${index}`);
    return ok(value * 2);
  });
  expect(events).toEqual(['start:0', 'end:0', 'start:1', 'end:1', 'start:2', 'end:2']);
  expect(isOk(result) && get(result)).toEqual([2, 4, 6]);
  expect(input).toEqual([1, 2, 3]);
  expectTypeOf(result).toEqualTypeOf<Result<readonly number[], never>>();
});

it('accepts synchronous Results and stops before invoking later operations', async () => {
  const visited: number[] = [];
  const result = await traverseAsync([1, 2, 3], (value): Result<number, string> => {
    visited.push(value);
    return value === 2 ? err('stop') : ok(value);
  });
  expect(visited).toEqual([1, 2]);
  expect(isErr(result) && getError(result)).toBe('stop');
  const empty = await traverseAsync([], () => ok(1));
  expect(isOk(empty) && get(empty)).toEqual([]);
});

it('does not convert thrown or rejected callback defects into Err', async () => {
  const failure = new Error('defect');
  await expect(
    traverseAsync([1], () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await expect(traverseAsync([1], () => Promise.reject(failure))).rejects.toBe(failure);
});
