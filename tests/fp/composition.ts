import { describe, expect, test, vi } from 'vitest';
import { array, assert, integer, property } from 'fast-check';
import {
  completeWithCleanup,
  err,
  flatMap,
  getError,
  getOrElse,
  isErr,
  map,
  mapError,
  match,
  none,
  ok,
  orElse,
  some,
  toResult,
  traverse,
} from '#src/index.ts';
import type { AsyncResult } from '#src/index.ts';
import { raise } from '#fixtures/foundation.ts';

test('maps only newly constructed cleanup failures without inspecting business error tags', () => {
  const business = { code: 'cleanup-failed', message: 'a feature-owned failure' };
  const project = vi.fn(
    (failure: Readonly<{ primary: unknown; cleanupErrors: readonly string[] }>) => ({
      code: 'project-cleanup',
      original: failure.primary,
      failures: failure.cleanupErrors,
    }),
  );
  expect(completeWithCleanup(err(business), [ok()], project)).toEqual(err(business));
  expect(project).not.toHaveBeenCalled();
  expect(completeWithCleanup(err(business), [err('close')], project)).toEqual(
    err({ code: 'project-cleanup', original: business, failures: ['close'] }),
  );
  expect(project).toHaveBeenCalledTimes(1);
  expect(() => completeWithCleanup(ok(), [err('close')], () => raise('mapper defect'))).toThrow(
    'mapper defect',
  );
});

describe('absence and sequential traversal', () => {
  test('creates absence errors lazily and retains present false-like values', () => {
    const missing = vi.fn(() => 'missing');
    expect(toResult(some(false), missing)).toEqual(ok(false));
    expect(missing).not.toHaveBeenCalled();
    expect(toResult(none(), missing)).toEqual(err('missing'));
    expect(missing).toHaveBeenCalledTimes(1);
  });
  test('traverses in order and does not execute operations after the first failure', () => {
    const visited: number[] = [];
    const result = traverse([1, 2, 3, 4], (value, index) => {
      visited.push(index);
      return value === 3 ? err('stop') : ok(value * 2);
    });
    expect(result).toEqual(err('stop'));
    expect(visited).toEqual([0, 1, 2]);
    const operation = vi.fn(() => ok(1));
    expect(traverse([], operation)).toEqual(ok([]));
    expect(operation).not.toHaveBeenCalled();
    assert(
      property(array(integer()), (values) => {
        expect(traverse(values, (value) => ok(value))).toEqual(ok(values));
      }),
    );
  });
});

describe('cleanup outcomes', () => {
  test('preserves the original result when every cleanup succeeds', () => {
    const success = ok(1);
    const failure = err('operation');
    expect(completeWithCleanup(success, [])).toBe(success);
    expect(completeWithCleanup(success, [ok(), ok({ closed: true })])).toBe(success);
    expect(completeWithCleanup(failure, [ok()])).toBe(failure);
  });
  test('prioritizes the operation failure and retains every cleanup failure in order', () => {
    expect(completeWithCleanup(err('operation'), [err('close'), ok(), err('release')])).toEqual(
      err({
        code: 'cleanup-failed',
        primary: 'operation',
        operationError: some('operation'),
        cleanupErrors: ['close', 'release'],
      }),
    );
    expect(completeWithCleanup(ok(1), [ok(), err('close'), err('release')])).toEqual(
      err({
        code: 'cleanup-failed',
        primary: 'close',
        operationError: none(),
        cleanupErrors: ['close', 'release'],
      }),
    );
    const result = completeWithCleanup(ok(), [err('close')]);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(Object.isFrozen(getError(result).cleanupErrors)).toBe(true);
  });
  test('never loses or reorders cleanup errors', () => {
    assert(
      property(array(integer(), { minLength: 1 }), (errors) => {
        expect(completeWithCleanup(err('primary'), errors.map(err))).toEqual(
          err({
            code: 'cleanup-failed',
            primary: 'primary',
            operationError: some('primary'),
            cleanupErrors: errors,
          }),
        );
      }),
    );
  });
});

describe('shared asynchronous operations', () => {
  test('maps and flat-maps successful and failed asynchronous inputs', async () => {
    expect(await map(Promise.resolve(ok(2)), (value) => value + 1)).toEqual(ok(3));
    expect(await map(Promise.resolve(ok(2)), async (value) => value + 1)).toEqual(ok(3));
    expect(await map(Promise.resolve(err('first')), () => 3)).toEqual(err('first'));
    expect(await flatMap(Promise.resolve(ok(2)), (value) => ok(value + 1))).toEqual(ok(3));
    expect(await flatMap(Promise.resolve(ok(2)), async () => err('second'))).toEqual(err('second'));
    const skipped = vi.fn(async () => ok(3));
    expect(await flatMap(Promise.resolve(err('first')), skipped)).toEqual(err('first'));
    expect(skipped).not.toHaveBeenCalled();
    expect(await mapError(Promise.resolve(err('first')), (error) => error.length)).toEqual(err(5));
    expect(await mapError(Promise.resolve(err('first')), async (error) => error.length)).toEqual(
      err(5),
    );
    expect(await mapError(Promise.resolve(ok(2)), () => 3)).toEqual(ok(2));
  });
  test('matches, unwraps and recovers only the selected asynchronous branch', async () => {
    const cases = { ok: async (value: number) => value + 1, err: (error: string) => error.length };
    expect(await match(Promise.resolve(ok(2)), cases)).toBe(3);
    expect(await match(Promise.resolve(err('first')), cases)).toBe(5);
    const fallback = vi.fn(async (error: string) => error.length);
    expect(await getOrElse(Promise.resolve(ok(2)), fallback)).toBe(2);
    expect(fallback).not.toHaveBeenCalled();
    expect(await getOrElse(Promise.resolve(err('first')), fallback)).toBe(5);
    expect(await orElse(Promise.resolve(err('first')), (error) => ok(error.length))).toEqual(ok(5));
    expect(await orElse(Promise.resolve(err('first')), async (error) => ok(error.length))).toEqual(
      ok(5),
    );
    const recovery = vi.fn(async () => ok(7));
    expect(await orElse(Promise.resolve(ok(2)), recovery)).toEqual(ok(2));
    expect(recovery).not.toHaveBeenCalled();
  });
  test('does not turn rejected inputs or callback defects into expected errors', async () => {
    const failure = new Error('defect');
    const consumers: readonly ((value: AsyncResult<number, string>) => Promise<unknown>)[] = [
      (value) => map(value, (number) => number + 1),
      (value) => flatMap(value, (number) => ok(number + 1)),
      (value) => mapError(value, (error) => error.length),
      (value) => match(value, { ok: (number) => number + 1, err: (error) => error.length }),
      (value) => getOrElse(value, () => 0),
      (value) => orElse(value, () => ok(0)),
    ];
    for (const consume of consumers)
      await expect(consume(Promise.reject(failure))).rejects.toBe(failure);
    await expect(map(Promise.resolve(ok(1)), () => raise(failure))).rejects.toBe(failure);
    await expect(flatMap(Promise.resolve(ok(1)), async () => raise(failure))).rejects.toBe(failure);
    await expect(mapError(Promise.resolve(err('first')), () => raise(failure))).rejects.toBe(
      failure,
    );
    await expect(
      match(Promise.resolve(ok(1)), { ok: () => raise(failure), err: () => 0 }),
    ).rejects.toBe(failure);
    await expect(getOrElse(Promise.resolve(err('first')), () => raise(failure))).rejects.toBe(
      failure,
    );
    await expect(orElse(Promise.resolve(err('first')), async () => raise(failure))).rejects.toBe(
      failure,
    );
  });
  test('does not catch synchronous callback defects either', () => {
    const failure = new Error('defect');
    for (const operation of [
      () => map(ok(1), () => raise(failure)),
      () => flatMap(some(1), () => raise(failure)),
      () => mapError(err('first'), () => raise(failure)),
      () => match(ok(1), { ok: () => raise(failure), err: () => 0 }),
      () => getOrElse(none(), () => raise(failure)),
      () => orElse(err('first'), () => raise(failure)),
      () => toResult(none(), () => raise(failure)),
      () => traverse([1], () => raise(failure)),
    ])
      expect(operation).toThrow(failure);
  });
});
