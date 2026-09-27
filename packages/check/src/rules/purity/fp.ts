import { unique, unknown } from '#src/rules/purity/values';
import type { Value } from '#src/rules/purity/values';
import { fpContract } from '#src/rules/purity/fp-contracts';

type Values = readonly Value[];
type Container = Extract<Value, { kind: 'container' }>;
export type FpOperations = Readonly<{
  call: (callbacks: Values, args: readonly Values[]) => Values;
  read: (values: Values, key: string) => Values;
  allocate: (
    shape: string,
    slots: Readonly<Record<string, Values>>,
    discriminator?: string,
  ) => Values;
  incomplete: (reason: string) => void;
}>;
const pack = (variant: Container['variant'], payload: Values = []): Container => ({
  kind: 'container',
  variant,
  payload,
});
const containers = (values: Values, operations: FpOperations): readonly Container[] =>
  values.flatMap((value) =>
    value.kind === 'container'
      ? [value]
      : [
          pack('ok', operations.read([value], 'value')),
          pack('err', operations.read([value], 'error')),
          pack('some', operations.read([value], 'value')),
          pack('none'),
        ],
  );
const payload = (values: Values, operations: FpOperations): Values =>
  unique(containers(values, operations).flatMap((value) => value.payload));
const present = (value: Container): boolean => value.variant === 'ok' || value.variant === 'some';

const transpose = (input: Values, operations: FpOperations): Values =>
  containers(input, operations).flatMap((outer) => {
    if (outer.variant === 'none') return [pack('ok', [outer])];
    if (outer.variant === 'err') return [pack('some', [outer])];
    return containers(outer.payload, operations).map((inner) => {
      if (outer.variant === 'some')
        return inner.variant === 'err' ? inner : pack('ok', [pack('some', inner.payload)]);
      return inner.variant === 'none' ? inner : pack('some', [pack('ok', inner.payload)]);
    });
  });

const possible = (tags: Values, expected: string | boolean): boolean =>
  tags.some((tag) => tag.kind !== 'literal' || tag.value === expected);

/** @impure Allocate DTO views while preserving the original payload references. */
const data = (name: string, input: Values, operations: FpOperations): Values => {
  if (name === 'fromResultData' || name === 'fromOptionData')
    return input.flatMap((value) => {
      const result = name === 'fromResultData';
      const tags = operations.read([value], result ? 'status' : 'present');
      const output: Value[] = [];
      if (possible(tags, result ? 'ok' : true))
        output.push(pack(result ? 'ok' : 'some', operations.read([value], 'value')));
      if (possible(tags, result ? 'error' : false))
        output.push(result ? pack('err', operations.read([value], 'error')) : pack('none'));
      return output;
    });
  return containers(input, operations).flatMap((value) => {
    const success = present(value),
      result = name === 'toResultData';
    const tag: Value = { kind: 'literal', value: result ? (success ? 'ok' : 'error') : success };
    const slots: Record<string, Values> = { [result ? 'status' : 'present']: [tag] };
    if (result || success) slots[success ? 'value' : 'error'] = value.payload;
    return operations.allocate('object', slots, value.variant);
  });
};

/** @impure Evaluate supplied callbacks in the current analysis context. */
const transform = (name: string, args: readonly Values[], operations: FpOperations): Values =>
  unique(
    containers(args[0] ?? [unknown], operations).flatMap((value) => {
      const success = present(value);
      if (name === 'match')
        return operations.call(
          operations.read(args[1] ?? [], value.variant),
          value.variant === 'none' ? [] : [value.payload],
        );
      if (name === 'getOrElse')
        return success ? value.payload : operations.call(args[1] ?? [], [value.payload]);
      if (name === 'orElse')
        return success ? [value] : operations.call(args[1] ?? [], [value.payload]);
      if (name === 'toResult')
        return success
          ? [pack('ok', value.payload)]
          : [pack('err', operations.call(args[1] ?? [], []))];
      if (name === 'mapError')
        return value.variant === 'err'
          ? [pack('err', operations.call(args[1] ?? [], [value.payload]))]
          : [value];
      if (name === 'inspectError') {
        if (value.variant === 'err') operations.call(args[1] ?? [], [value.payload]);
        return [value];
      }
      if (!success) return [value];
      const result = operations.call(args[1] ?? [], [value.payload]);
      if (name === 'flatMap') return result;
      if (name === 'map') return [pack(value.variant, result)];
      if (name === 'andThrough')
        return [value, ...containers(result, operations).filter((item) => item.variant === 'err')];
      if (name === 'filter')
        return [
          value,
          value.variant === 'some'
            ? pack('none')
            : pack('err', operations.call(args[2] ?? [], [value.payload])),
        ];
      return [value];
    }),
  );

/** @impure Evaluate each collection callback with its element origins. */
const collection = (name: string, args: readonly Values[], operations: FpOperations): Values => {
  const elements = operations.read(args[0] ?? [], '*');
  const transformed = operations.call(args[1] ?? [], [elements, [unknown]]);
  if (name === 'isUniqueBy') return [unknown];
  if (name === 'findValue') return [pack('some', elements), pack('none')];
  const values = payload(transformed, operations);
  if (name === 'findMap') return [pack('some', values), pack('none')];
  const output = operations.allocate('array', { '*': values });
  return name === 'filterMap'
    ? output
    : [
        pack('ok', output),
        ...containers(transformed, operations).filter((value) => value.variant === 'err'),
      ];
};

/** @impure Evaluate external operations and possible classifier calls. */
const capturing = (name: string, args: readonly Values[], operations: FpOperations): Values => {
  const result = operations.call(args[0] ?? [], []);
  const classified = operations.call(operations.read(args[1] ?? [], 'classify'), [[unknown]]);
  const failure = pack('err', [unknown, ...payload(classified, operations)]);
  return name === 'captureResult' || name === 'captureResultAsync'
    ? [...result, failure]
    : [pack('ok', result), failure];
};

/** @impure Evaluate a cleanup error projection, retaining both sources of failure. */
const cleanup = (args: readonly Values[], operations: FpOperations): Values => {
  const primary = args[0] ?? [unknown];
  const failed = containers(operations.read(args[1] ?? [], '*'), operations).filter(
    (value) => value.variant === 'err',
  );
  if (failed.length === 0) return primary;
  const errors = failed.flatMap((value) => value.payload);
  const completion = operations.allocate('object', {
    primary: [...payload(primary, operations), ...errors],
    operationError: [pack('some', payload(primary, operations)), pack('none')],
    cleanupErrors: operations.allocate('array', { '*': errors }),
  });
  const projected = args[2]?.length ? operations.call(args[2], [completion]) : completion;
  return [...primary, pack('err', projected)];
};

/** @impure Propagate callbacks and allocation ownership through the known fp API. */
export const evaluateFp = (
  name: string,
  args: readonly Values[],
  operations: FpOperations,
): Values => {
  const input = args[0] ?? [unknown];
  const contract = fpContract(name);
  if (!contract || contract === 'opaque') {
    operations.incomplete('Unsupported fp operation: ' + name);
    return [unknown];
  }
  if (contract === 'predicate' || contract === 'unit') return [unknown];
  if (contract === 'data') return data(name, input, operations);
  if (name === 'transpose') return transpose(input, operations);
  if (name === 'ok' || name === 'err' || name === 'some' || name === 'none')
    return [pack(name, name === 'none' ? [] : input)];
  if (name === 'branded') return [{ kind: 'decoder', callbacks: args[1] ?? [] }];
  if (name === 'get')
    return containers(input, operations)
      .filter(present)
      .flatMap((value) => value.payload);
  if (name === 'getError')
    return containers(input, operations)
      .filter((value) => value.variant === 'err')
      .flatMap((value) => value.payload);
  if (name === 'fromNullable') return [pack('some', input), pack('none')];
  if (name === 'nonEmpty') return [pack('some', input), pack('none')];
  if (name === 'at' || name === 'lookup')
    return [pack('some', operations.read(input, '*')), pack('none')];
  if (contract === 'transform') return transform(name, args, operations);
  if (contract === 'collection') return collection(name, args, operations);
  if (contract === 'capture') return capturing(name, args, operations);
  if (name === 'completeWithCleanup') return cleanup(args, operations);
  if (name === 'decodeJson') {
    const parsed = operations.allocate('object', {});
    return [
      ...operations.call(operations.read(args[1] ?? [], 'decode'), [parsed]),
      pack('err', [unknown]),
    ];
  }
  if (name === 'encodeJson') {
    operations.call(operations.read(args[1] ?? [], 'encode'), [input]);
    return [pack('ok', [unknown]), pack('err', [unknown])];
  }
  if (name === 'flatten')
    return containers(input, operations).flatMap((value) =>
      present(value) ? value.payload : [value],
    );
  if (name === 'all' || name === 'validateAll')
    return [
      pack(
        'ok',
        operations.allocate('array', { '*': payload(operations.read(input, '*'), operations) }),
      ),
      pack('err', [unknown]),
    ];
  return [unknown];
};
