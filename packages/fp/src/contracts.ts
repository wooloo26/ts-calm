import type { Ok, Result } from './containers.ts';

/**
 * A value that is not thenable, used to reject promises where a synchronous transform is required.
 *
 * `Synchronous<Promise<T>>` is `never`, so a synchronous overload cannot silently accept an
 * asynchronous callback.
 */
export type Synchronous<Value> = Value &
  (Extract<Value, PromiseLike<unknown>> extends never ? unknown : never);

/** Validates untrusted input into a `Result`; the first method to call at an external boundary. */
export type Decoder<Value, Problem> = (input: unknown) => Result<Value, Problem>;
/** Recover the value a decoder produces, as a type-level helper for generic constraints. */
export type Decoded<Decode> = Decode extends (..._arguments: never[]) => infer Container
  ? Container extends Ok<infer Value>
    ? Value
    : never
  : never;
/** Pairs validation with serialization so the wire shape is stated once. */
export type Codec<Value, Data, Problem> = Readonly<{
  decode: Decoder<Value, Problem>;
  encode: (value: Value) => Data;
}>;
/** A readonly array proven to hold at least one element, so `[0]` is always defined. */
export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];
