import { expectTypeOf, test } from 'vitest';
import {
  all,
  at,
  branded,
  err,
  filter,
  filterMap,
  findMap,
  flatten,
  inspect,
  inspectError,
  lookup,
  nonEmpty,
  none,
  ok,
  some,
  transpose,
  validateAll,
} from '@ts-calm/fp';
import type {
  AsyncResult,
  Brand,
  Codec,
  Decoded,
  Decoder,
  Err,
  JsonCodec,
  JsonValue,
  NonEmptyReadonlyArray,
  None,
  Ok,
  Option,
  Result,
  Some,
} from '@ts-calm/fp';
import { capture, captureResult, captureResultAsync } from '@ts-calm/fp/boundary';
import type { Fault } from '@ts-calm/fp/boundary';

test('checked constructors and codecs infer vendor-independent values', () => {
  const stringDecoder: Decoder<string, 'not-string'> = (input) =>
    typeof input === 'string' ? ok(input) : err('not-string');
  const identifier = branded('player', stringDecoder);
  expectTypeOf(identifier.parse).toEqualTypeOf<Decoder<Brand<string, 'player'>, 'not-string'>>();
  expectTypeOf<Decoded<typeof identifier.parse>>().toEqualTypeOf<Brand<string, 'player'>>();
  expectTypeOf<Decoded<() => Err<'invalid'>>>().toEqualTypeOf<never>();
  const aggregate = branded('player-count', (input: Readonly<{ count: number }>) => ok(input));
  expectTypeOf(aggregate.parse).parameter(0).toEqualTypeOf<Readonly<{ count: number }>>();
  expectTypeOf<Decoded<typeof aggregate.parse>>().toEqualTypeOf<
    Brand<Readonly<{ count: number }>, 'player-count'>
  >();
  expectTypeOf<Brand<string, 'player'>>().toExtend<string>();
  expectTypeOf<Brand<string, 'operation'>>().not.toExtend<Brand<string, 'player'>>();
  expectTypeOf<string>().not.toExtend<Brand<string, 'player'>>();
  expectTypeOf<JsonCodec<string, 'invalid'>>().toEqualTypeOf<Codec<string, JsonValue, 'invalid'>>();
  expectTypeOf(nonEmpty([1, 2])).toEqualTypeOf<Option<NonEmptyReadonlyArray<number>>>();
  expectTypeOf(at(['one', 'two'], -1)).toEqualTypeOf<Option<string>>();
  expectTypeOf(lookup({ count: 1, label: 'a' }, 'count')).toEqualTypeOf<Option<number>>();
  expectTypeOf(lookup(new Map<string, number>(), 'key')).toEqualTypeOf<Option<number>>();
  interface NamedRecord {
    readonly count: number;
  }
  const readNamed = (value: NamedRecord) => lookup(value, 'count');
  expectTypeOf(readNamed).returns.toEqualTypeOf<Option<number>>();
});

test('named and tuple collections preserve readonly names, positions and error unions', () => {
  expectTypeOf(all({ revision: ok(1), name: ok('player') })).toEqualTypeOf<
    Result<Readonly<{ revision: 1; name: 'player' }>, never>
  >();
  expectTypeOf(validateAll([ok(1), err('first'), err('second')])).toEqualTypeOf<
    Result<readonly [1, never, never], NonEmptyReadonlyArray<'first' | 'second'>>
  >();
  expectTypeOf(validateAll({ first: err('first'), second: ok(1) })).toEqualTypeOf<
    Result<Readonly<{ first: never; second: 1 }>, NonEmptyReadonlyArray<'first'>>
  >();
  expectTypeOf(filterMap([1, 2], (value) => some(String(value)))).toEqualTypeOf<
    readonly string[]
  >();
  expectTypeOf(findMap([1, 2], (value) => some(String(value)))).toEqualTypeOf<Option<string>>();
  const infer = (value: Result<Result<number, 'inner'>, 'outer'>) => flatten(value);
  expectTypeOf(infer).returns.toEqualTypeOf<Result<number, 'inner' | 'outer'>>();
  expectTypeOf(flatten(ok(err('inner')))).toEqualTypeOf<Err<'inner'>>();
  expectTypeOf(flatten(err('outer'))).toEqualTypeOf<Err<'outer'>>();
  expectTypeOf(flatten(some(none()))).toEqualTypeOf<None>();
  expectTypeOf(transpose(some(err('failed')))).toEqualTypeOf<Err<'failed'>>();
  expectTypeOf(transpose(ok(some(1)))).toEqualTypeOf<Some<Ok<1>>>();
  const narrow = (value: Result<string | number, 'first'>) =>
    filter(
      value,
      (item): item is string => typeof item === 'string',
      () => 'not-string' as const,
    );
  expectTypeOf(narrow).returns.toEqualTypeOf<Result<string, 'first' | 'not-string'>>();
  const missing = (value: Option<string | number>) =>
    filter(value, (item): item is string => typeof item === 'string');
  expectTypeOf(missing).returns.toEqualTypeOf<Option<string>>();
});

test('observers preserve known variants and captured Results preserve all failure types', () => {
  const observe = (): void => {};
  expectTypeOf(inspect(ok(1), observe)).toEqualTypeOf<Ok<1>>();
  expectTypeOf(inspect(some(1), observe)).toEqualTypeOf<Some<1>>();
  expectTypeOf(inspect(err('failed'), observe)).toEqualTypeOf<Err<'failed'>>();
  expectTypeOf(inspect(none(), observe)).toEqualTypeOf<None>();
  expectTypeOf(inspectError(ok(1), observe)).toEqualTypeOf<Ok<1>>();
  expectTypeOf(inspectError(err('failed'), observe)).toEqualTypeOf<Err<'failed'>>();
  expectTypeOf(inspect(Promise.resolve(ok(1)), async () => {})).toEqualTypeOf<
    AsyncResult<1, never>
  >();
  expectTypeOf(capture(() => 1, { name: 'native' })).toEqualTypeOf<Result<number, Fault>>();
  const operation = (): Result<number, 'domain'> => ok(1);
  expectTypeOf(
    captureResult(operation, { name: 'run', classify: () => some('known') }),
  ).toEqualTypeOf<Result<number, 'domain' | 'known' | Fault>>();
  expectTypeOf(captureResultAsync(async () => operation(), { name: 'run' })).toEqualTypeOf<
    AsyncResult<number, 'domain' | Fault>
  >();
});

test('unsafe container mixing and discarded observer results fail compilation', () => {
  const reject = (result: Result<number, string>, option: Option<number>): void => {
    // @ts-expect-error Only matching containers can be flattened.
    flatten(ok(option));
    // @ts-expect-error Only matching containers can be flattened.
    flatten(some(result));
    // @ts-expect-error Transpose exchanges distinct container families.
    transpose(ok(result));
    // @ts-expect-error Named collections cannot silently discard Option absence.
    all({ result, option });
    // @ts-expect-error Accumulating validation accepts only Results.
    validateAll({ result, option });
    // @ts-expect-error Filtering cannot discard mapped business errors.
    filterMap([1], ok);
    // @ts-expect-error Searching cannot discard mapped business errors.
    findMap([1], ok);
    // @ts-expect-error Result filters need an explicit error constructor.
    filter(result, () => true);
    // @ts-expect-error Map key mismatches must not fall through to the record overload.
    lookup(new Map<number, string>(), 'wrong-key');
    // @ts-expect-error Observation must not discard a returned Result.
    inspect(result, () => ok());
    // @ts-expect-error Observation must not discard a returned Result.
    inspectError(result, () => err('ignored'));
    // @ts-expect-error A synchronous observer cannot hide a Promise.
    inspect(result, async () => {});
    // @ts-expect-error Even an unvisited branch must obey the synchronous contract.
    inspect(err('failed'), async () => {});
    // @ts-expect-error Async observation must not discard a Result inside a Promise.
    inspect(Promise.resolve(result), async () => ok());
    // @ts-expect-error Async error observation must not discard a Result.
    inspectError(Promise.resolve(result), async () => err('ignored'));
    // @ts-expect-error Plain callback values are not observations either.
    inspect(result, () => 1);
    // @ts-expect-error Use captureResultAsync for asynchronous operations.
    captureResult(async () => result, { name: 'wrong' });
    // @ts-expect-error There is no unchecked brand construction API.
    branded('player', (input) => ok(input)).unsafe('value');
  };
  expectTypeOf(reject).toBeFunction();
});
