/** Every runtime export needs an explicit analysis decision; adding an fp API must update this table. */
type FpExport = keyof typeof import('@ts-calm/fp') | keyof typeof import('@ts-calm/fp/boundary');
export type FpContract =
  | 'constructor'
  | 'decoder'
  | 'get'
  | 'nullable'
  | 'lookup'
  | 'nested'
  | 'data'
  | 'predicate'
  | 'unit'
  | 'aggregate'
  | 'transform'
  | 'collection'
  | 'capture'
  | 'cleanup'
  | 'codec'
  | 'opaque';
export const fpContracts = {
  ok: 'constructor',
  err: 'constructor',
  some: 'constructor',
  none: 'constructor',
  unit: 'unit',
  get: 'get',
  getError: 'get',
  isOk: 'predicate',
  isErr: 'predicate',
  isSome: 'predicate',
  isNone: 'predicate',
  isResult: 'predicate',
  isOption: 'predicate',
  isArray: 'predicate',
  isObject: 'predicate',
  isPlainObject: 'predicate',
  hasOwn: 'predicate',
  isBoolean: 'predicate',
  isNull: 'predicate',
  isNumber: 'predicate',
  isString: 'predicate',
  isUndefined: 'predicate',
  isNonNullable: 'predicate',
  fromNullable: 'nullable',
  nonEmpty: 'nullable',
  at: 'lookup',
  lookup: 'lookup',
  branded: 'decoder',
  flatten: 'nested',
  transpose: 'nested',
  fromResultData: 'data',
  fromOptionData: 'data',
  toResultData: 'data',
  toOptionData: 'data',
  all: 'aggregate',
  validateAll: 'aggregate',
  map: 'transform',
  flatMap: 'transform',
  mapError: 'transform',
  filter: 'transform',
  andThrough: 'transform',
  inspect: 'transform',
  inspectError: 'transform',
  getOrElse: 'transform',
  orElse: 'transform',
  match: 'transform',
  toResult: 'transform',
  traverse: 'collection',
  traverseAsync: 'collection',
  filterMap: 'collection',
  findMap: 'collection',
  findValue: 'collection',
  isUniqueBy: 'collection',
  capture: 'capture',
  captureAsync: 'capture',
  captureResult: 'capture',
  captureResultAsync: 'capture',
  completeWithCleanup: 'cleanup',
  decodeJson: 'codec',
  encodeJson: 'codec',
  formatDiagnostic: 'opaque',
} as const satisfies Readonly<Record<FpExport, FpContract>>;
const contracts: ReadonlyMap<string, FpContract> = new Map(Object.entries(fpContracts));
export const fpContract = (name: string): FpContract | false => contracts.get(name) ?? false;
/** These contracts only construct/read data; evaluating them does not invoke supplied callbacks. */
export const passiveFp = (name: string): boolean =>
  [
    'constructor',
    'decoder',
    'get',
    'nullable',
    'lookup',
    'nested',
    'data',
    'predicate',
    'unit',
    'aggregate',
  ].some((kind) => kind === fpContract(name));
