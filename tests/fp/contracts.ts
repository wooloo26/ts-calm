import { expect, expectTypeOf, test } from 'vitest';
import {
  all,
  err,
  flatMap,
  get,
  getError,
  getOrElse,
  isErr,
  isNone,
  isOk,
  isSome,
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
import type { AsyncResult, Err, None, Ok, Option, Result, Some, Unit } from '#src/index.ts';
import { capture, captureAsync } from '#src/boundary.ts';
import type { Fault } from '#src/boundary.ts';

test('constructors preserve literals without assertions or public fields', () => {
  expectTypeOf(ok({ revision: 1 })).toEqualTypeOf<Ok<Readonly<{ revision: 1 }>>>();
  expectTypeOf(err('invalid-request')).toEqualTypeOf<Err<'invalid-request'>>();
  expectTypeOf(some(false)).toEqualTypeOf<Some<false>>();
  expectTypeOf(none()).toEqualTypeOf<None>();
  expectTypeOf(ok()).toEqualTypeOf<Ok<Unit>>();
  expectTypeOf<Extract<keyof Ok<number>, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof Err<string>, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof Some<number>, string>>().toEqualTypeOf<never>();
  expectTypeOf<{ value: number }>().not.toExtend<Option<number>>();
  expectTypeOf<Result<number, string>>().not.toExtend<Parameters<typeof get>[0]>();
  expectTypeOf<Option<number>>().not.toExtend<Parameters<typeof get>[0]>();
});

test('predicates narrow both positive and negative branches without losing generic values', () => {
  const readResult = <Value, Problem>(input: Result<Value, Problem>): Value | Problem => {
    if (isOk(input)) {
      const value: Value = get(input);
      return value;
    }
    const error: Problem = getError(input);
    return error;
  };
  const readErrorFirst = (input: Result<number, string>): number =>
    isErr(input) ? getError(input).length : get(input);
  const readOption = <Value>(input: Option<Value>, fallback: Value): Value =>
    isSome(input) ? get(input) : fallback;
  const readNoneFirst = (input: Option<number>): number => (isNone(input) ? 0 : get(input));
  expect(readResult(ok(2))).toBe(2);
  expect(readResult(err('failure'))).toBe('failure');
  expect(readErrorFirst(err('abc'))).toBe(3);
  expect(readErrorFirst(ok(4))).toBe(4);
  expect(readOption(some(3), 0)).toBe(3);
  expect(readOption(none(), 0)).toBe(0);
  expect(readNoneFirst(none())).toBe(0);
  expect(readNoneFirst(some(2))).toBe(2);
});

test('shared operations infer callback inputs, output unions and accumulated errors', () => {
  expectTypeOf(map(ok(2), (value) => value + 1)).toEqualTypeOf<Ok<number>>();
  expectTypeOf(map(some(2), (value) => value + 1)).toEqualTypeOf<Some<number>>();
  expectTypeOf(map(err('failure'), () => 1)).toEqualTypeOf<Err<'failure'>>();
  expectTypeOf(flatMap(ok(2), () => err('failure'))).toEqualTypeOf<Err<'failure'>>();
  expectTypeOf(flatMap(some(2), () => none())).toEqualTypeOf<None>();
  const combine = (input: Result<number, 'first'>) => flatMap(input, () => err('second'));
  expectTypeOf(combine).returns.toEqualTypeOf<Result<never, 'first' | 'second'>>();
  expectTypeOf(
    match(ok(1), { ok: (value) => value + 1, err: () => 'failure' }),
  ).toEqualTypeOf<number>();
  expectTypeOf(
    match(some(1), { some: (value) => value + 1, none: () => false }),
  ).toEqualTypeOf<number>();
  expectTypeOf(getOrElse(none(), () => 0)).toEqualTypeOf<number>();
  expectTypeOf(getOrElse(err('failure'), (error) => error.length)).toEqualTypeOf<number>();
  expectTypeOf(orElse(err('failure'), () => ok(1))).toEqualTypeOf<Ok<1>>();
  expectTypeOf(mapError(ok(1), () => 'unused')).toEqualTypeOf<Ok<1>>();
  expectTypeOf(mapError(err('failure'), (value) => value.length)).toEqualTypeOf<Err<number>>();
  expectTypeOf(toResult(some(1), () => 'absent')).toEqualTypeOf<Ok<1>>();
  expectTypeOf(toResult(none(), () => 'absent')).toEqualTypeOf<Err<string>>();
  expectTypeOf(traverse([1, 2], (value) => ok(value + 1))).toEqualTypeOf<
    Result<readonly number[], never>
  >();
  expectTypeOf(all([ok(1), ok('two')])).toEqualTypeOf<Result<readonly [1, 'two'], never>>();
  const input: readonly Result<number, string>[] = [ok(1), err('failure')];
  expectTypeOf(all(input)).toEqualTypeOf<Result<readonly number[], string>>();
  const options: readonly Option<number>[] = [some(1), none()];
  expectTypeOf(options.filter(isSome)).toExtend<Some<number>[]>();
  expectTypeOf(input.filter(isOk)).toExtend<Ok<number>[]>();
  expectTypeOf(input.filter(isErr)).toExtend<Err<string>[]>();
  expectTypeOf(options.filter(isSome).map(get)).toEqualTypeOf<number[]>();
  expectTypeOf(input.filter(isErr).map(getError)).toEqualTypeOf<string[]>();
  const readUnion = (value: Ok<number> | Ok<string> | Some<boolean>) => get(value);
  const readErrors = (value: Err<number> | Err<string>) => getError(value);
  expectTypeOf(readUnion).returns.toEqualTypeOf<number | string | boolean>();
  expectTypeOf(readErrors).returns.toEqualTypeOf<number | string>();
});

test('asynchronous inputs use the shared operations and preserve error unions', () => {
  const assertions = (input: AsyncResult<number, 'first'>): void => {
    expectTypeOf(map(input, (value) => String(value))).toEqualTypeOf<
      AsyncResult<string, 'first'>
    >();
    expectTypeOf(map(input, async (value) => String(value))).toEqualTypeOf<
      AsyncResult<string, 'first'>
    >();
    expectTypeOf(flatMap(input, async () => err('second'))).toEqualTypeOf<
      AsyncResult<never, 'first' | 'second'>
    >();
    expectTypeOf(mapError(input, async (error) => error.length)).toEqualTypeOf<
      AsyncResult<number, number>
    >();
    expectTypeOf(
      match(input, { ok: async (value) => value + 1, err: () => 'failed' }),
    ).toEqualTypeOf<Promise<number | string>>();
    expectTypeOf(getOrElse(input, async () => 'failed')).toEqualTypeOf<Promise<number | string>>();
    expectTypeOf(orElse(input, async () => err('second'))).toEqualTypeOf<
      AsyncResult<number, 'second'>
    >();
    expectTypeOf(capture(() => 1, { name: 'number', classify: () => none() })).toEqualTypeOf<
      Result<number, Fault>
    >();
    expectTypeOf(
      captureAsync(async () => 1, { name: 'number', classify: () => none() }),
    ).toEqualTypeOf<AsyncResult<number, Fault>>();
  };
  expectTypeOf(assertions).toBeFunction();
});

test('compile-time contracts reject unsafe reads and mixed container operations', () => {
  const invalidUsage = (result: Result<number, string>, option: Option<number>): void => {
    // @ts-expect-error The success branch must be established before reading a Result.
    get(result);
    // @ts-expect-error The present branch must be established before reading an Option.
    get(option);
    // @ts-expect-error Errors can only be read after refinement.
    getError(result);
    // @ts-expect-error Representation is private.
    expect(result.kind).toBe('ok');
    // @ts-expect-error Representation is private.
    expect(option.value).toBe(1);
    // @ts-expect-error Constructor object literals remain readonly to consumers.
    get(ok({ count: 1 })).count = 2;
    // @ts-expect-error Callbacks cannot switch container families.
    flatMap(result, some);
    // @ts-expect-error Callbacks cannot switch container families.
    flatMap(option, ok);
    // @ts-expect-error Result matching requires the Result case names.
    match(result, { some: (value: number) => value, none: () => 0 });
    // @ts-expect-error Option matching requires the Option case names.
    match(option, { ok: (value: number) => value, err: () => 0 });
    // @ts-expect-error Matching must be exhaustive.
    match(result, { ok: (value: number) => value });
    // @ts-expect-error A required argument cannot be passed to an Option fallback.
    getOrElse(option, (error: string) => error.length);
    // @ts-expect-error Option and Result collections cannot be mixed.
    all([result, option]);
    // @ts-expect-error A synchronous container cannot hide a Promise callback.
    map(result, async (value) => value + 1);
    // @ts-expect-error The restriction includes known success variants.
    map(ok(1), async (value) => value + 1);
    // @ts-expect-error The restriction includes a callback on an unvisited error branch.
    map(err('failure'), async () => 1);
    // @ts-expect-error Option remains synchronous.
    map(option, async (value) => value + 1);
    // @ts-expect-error Mixed synchronous/asynchronous callback returns are rejected.
    map(result, (value) => (value > 0 ? value : Promise.resolve(value)));
    // @ts-expect-error Synchronous flatMap cannot accept an AsyncResult callback.
    flatMap(result, async (value) => ok(value + 1));
    // @ts-expect-error Synchronous error mapping cannot introduce Promise errors.
    mapError(result, async (error) => error.length);
    // @ts-expect-error captureAsync is the explicit asynchronous boundary.
    capture(() => Promise.resolve(1), { name: 'async', classify: () => none() });
  };
  expectTypeOf(invalidUsage).toBeFunction();
});
