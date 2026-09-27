# Necessary line allowances

Use the functions in `@ts-calm/fp` first. An allowance documents an unavoidable boundary
constraint, not a shortcut around validation or function design. Only `.b.ts` files may contain
allowances. Keep `@boundary` and actual `@effects` in the file header.

## Syntax and migration

Write `// @allow <exact-rule> -- concrete reason` on the line immediately above the diagnostic.
It covers only occurrences of that exact rule starting on the next code line, never a whole
statement, function or block. For multiline expressions, use the reported line number.
Several consecutive allowance comments, each with its own reason, share the next code line.
Blank lines or other comments break attachment. An ordinary trailing comment on the code is fine.

Only concrete `strict-fp/<check>` rules and `function-params` are supported. Header JSDoc,
trailing allowance comments, `strict-fp/*`, unknown rules, missing reasons, duplicates and stale
allowances are errors. Remove the old header allowance, replace avoidable syntax with fp helpers,
then add individual line comments only where a case below applies. An allowance never silences
boundary declarations, imports, cycles or purity checks. The independent
`calm-allow-next-function function-length` annotation is unchanged.

## Permitted cases

| Necessary constraint                                                      | Why a helper cannot replace it                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementing an fp primitive itself                                       | Implementing `capture` with `capture`, or an absence predicate with itself, would recurse. This is limited to the primitive implementation.                                                       |
| A protocol requires an actual sentinel or an external API fixes the shape | An Option payload, options object or ordinary function cannot replace a required wire null, callback ABI, external class/receiver, or host-owned state operation.                                 |
| A proven type relationship is lost by TypeScript                          | A guard or decoder has already established the invariant, but the compiler cannot retain branded types, collection membership or correlated overloads. State the invariant next to the assertion. |
| A boundary must preserve an existing exception or cleanup contract        | Returning Result would break callers, or replacing finally would change exception precedence or cleanup timing. This does not justify throwing for ordinary domain failures in new APIs.          |

Examples in the implementation include [capture](../packages/fp/src/capture.b.ts),
[correlated overloads](../packages/fp/src/operations.b.ts),
[validated collection views](../packages/fp/src/values.b.ts), and
[host module-cache cleanup](../packages/check/src/config-reader.b.ts).
A file with only type declarations still does not satisfy the boundary implementation requirement.
Reasons are reviewed for these constraints; the checker validates scope, rule and usage, not the
truth of a free-text explanation.

## Protocol values

The following example belongs in a file headed with
`/** @boundary Preserve the protocol's empty scalar. */`:

```ts
export const protocolEmpty = () => {
  // @allow strict-fp/no-null -- The wire protocol requires a real null scalar; Option would change the payload.
  return null;
};
```

Ordinary absence uses `fromNullable` instead. Sentinel predicates `isNull` and `isUndefined`
are for an actual protocol distinction; do not replace Option handling with repeated sentinel tests.

## Fixed external callbacks

The following belongs in a documented `.b.ts` adapter:

```ts
// @allow function-params -- The vendor invokes this exact four-argument callback; an options object is incompatible.
export const vendorCallback = (
  error: unknown,
  request: unknown,
  response: unknown,
  next: () => void,
) => {
  next();
  return { error, request, response };
};
```

For your own functions, group related inputs in a named readonly object. The fixed maximum is
three formal parameters, including optional/default parameters. Destructuring and rest each count
as one. The TypeScript `this` parameter and generic parameters do not count. All callable type
signatures are checked too; call-site argument counts are not limited. The boolean
`function-params` setting follows normal project and file override configuration.

## Cleanup contracts

Use this exception only when the existing boundary contract requires JavaScript finally semantics:

```ts
export const preserveCleanup = <Value>(operation: () => Value, cleanup: () => void): Value => {
  // @allow strict-fp/no-try -- This existing API requires finally completion semantics, including cleanup replacing a pending throw.
  try {
    return operation();
  } finally {
    cleanup();
  }
};
```

A new Result-based operation can use the following instead. `completeWithCleanup` combines
outcomes; it does not execute cleanup. Execute every cleanup before passing its Result, in order.
The combined result retains both operation and cleanup errors, which intentionally differs from
finally allowing a cleanup exception to replace the original failure.

`capture` comes from `@ts-calm/fp/boundary`; `completeWithCleanup` comes from `@ts-calm/fp`.

```ts
export const completeSafely = (operation: () => string, cleanup: () => void) => {
  const primary = capture(operation, { name: 'primary' });
  const cleaned = capture(cleanup, { name: 'cleanup' });
  return completeWithCleanup(primary, [cleaned]);
};
```

## Use fp outside those cases

| Avoidable code                                     | Replacement                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| try/catch around an external call                  | `capture` / `captureAsync`; use `captureResult` / `captureResultAsync` when it already returns Result |
| throw for validation or expected failure           | `err`, then `match`, `mapError` or `flatMap`                                                          |
| null/undefined for absence                         | `fromNullable`, `match`, `getOrElse` or `toResult`                                                    |
| Non-null assertions and unchecked collection reads | `at` / `lookup`, then handle Option                                                                   |
| any or casts for untrusted values                  | `unknown`, `isArray`, `isObject`, `isPlainObject`, `hasOwn`, primitive guards and a Decoder           |
| A branded cast after validation                    | `branded` with a validating decoder                                                                   |
| Direct JSON parsing/serialization boilerplate      | `decodeJson` / `encodeJson` and an explicit codec                                                     |
| More than three parameters in an owned API         | A named parameter object with meaningful fields                                                       |

Import the following helpers from `@ts-calm/fp`:

```ts
export const externalLabel = (input: unknown) => getOrElse(fromNullable(input), () => 'anonymous');
export const decodeName = (input: unknown) =>
  isString(input) && input.trim() ? ok(input.trim()) : err('invalid-name');
```

For `no-class`, `no-this`, `no-var`, `no-with`, `no-delete` and `no-module-state`,
prefer readonly data, explicit function inputs, const, property access, immutable reconstruction
and operation-owned state. There is no invented fp helper for these ordinary language constructs.
Only an actual external constraint from the table permits an exception.

These snippets are compiled in
[allow-examples.b.ts](../packages/check/tests/fixtures/allow-examples.b.ts), checked with the real
rules and executed by [allow-guide.ts](../packages/check/tests/allow-guide.ts).
