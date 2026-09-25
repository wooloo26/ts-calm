import type { Ok, Result } from './containers.ts';

export type Synchronous<Value> = Value &
  (Extract<Value, PromiseLike<unknown>> extends never ? unknown : never);

export type Decoder<Value, Problem> = (input: unknown) => Result<Value, Problem>;
export type Decoded<Decode> = Decode extends (...argumentsList: never[]) => infer Container
  ? Container extends Ok<infer Value>
    ? Value
    : never
  : never;
export type Codec<Value, Data, Problem> = Readonly<{
  decode: Decoder<Value, Problem>;
  encode: (value: Value) => Data;
}>;
export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];
