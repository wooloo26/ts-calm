import { expect, test, vi } from 'vitest';
import type { Result } from '#src/index.ts';
import { andThrough, err, getError, isErr, ok, some } from '#src/index.ts';
import { raise } from '#fixtures/foundation.ts';

type ReadFailure = Readonly<{ code: 'missing' }>;
type CheckFailure = Readonly<{ code: 'stale' }>;
const missing: ReadFailure = { code: 'missing' };
const stale: CheckFailure = { code: 'stale' };
const accepted = (value: number): Result<number, CheckFailure> =>
  value > 0 ? ok(value * 2) : err(stale);

test('skips the check and retains the original container when the input already failed', () => {
  const check = vi.fn(accepted);
  const failure = err<ReadFailure>(missing);
  const result = andThrough(failure, check);
  expect(result).toBe(failure);
  expect(check).not.toHaveBeenCalled();
});

test('returns the original success container by reference and runs the check once', () => {
  const check = vi.fn(accepted);
  const success = ok(3);
  const result = andThrough(success, check);
  expect(result).toBe(success);
  expect(check).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith(3);
});

test('propagates the check failure and leaves the original payload untouched', () => {
  const value = { count: 0 };
  const success = ok(value);
  const reject = (input: Result<{ count: number }, never>) =>
    andThrough(input, (): Result<number, CheckFailure> => err(stale));
  const result = reject(success);
  expect(isErr(result)).toBe(true);
  expect(result).toEqual(err(stale));
  expect(success).toEqual(ok(value));
});

test('joins both failure unions so an input or check error stays narrowable', () => {
  const decide = (input: Result<number, ReadFailure>) => andThrough(input, accepted);
  expect(decide(err(missing))).toEqual(err(missing));
  const decided = decide(ok(2));
  expect(decided).toEqual(ok(2));
  if (isErr(decided)) expect(getError(decided).code).toBe('stale');
});

test('never inspects an Option and leaves callback defects to the caller boundary', () => {
  const defect = new Error('check defect');
  expect(() => andThrough(ok(1), () => ok(some(1)))).not.toThrow();
  expect(() => andThrough(ok(1), () => raise(defect))).toThrow(defect);
});

test('stays synchronous and refuses an Option as a check result', () => {
  // @ts-expect-error an asynchronous check is not a synchronous Result
  expect(() => andThrough(ok(1), async () => ok(2))).not.toThrow();
  // @ts-expect-error an Option is never a check result
  andThrough(ok(1), () => some(2));
});
