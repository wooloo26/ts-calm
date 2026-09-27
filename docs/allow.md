# Necessary allowances

Use fp helpers first. An `@allow` belongs only in `.b.ts`, with a reason explaining the
unavoidable constraint. Keep `@boundary` and actual `@effects` in the file header.

## Syntax

Write `// @allow <exact-rule> -- reason` immediately above the diagnostic line.
Only that rule on that line is covered. Consecutive directives share the next code line;
blank lines or other comments break attachment. Use the diagnostic location for multiline syntax.

Supported rules are concrete `strict-fp/<check>` names and `function-params`.
Header JSDoc, trailing directives, wildcards, missing reasons, duplicate and unused allowances
are errors. Move old header allowances to necessary individual lines. Other checks remain active;
the separate `calm-allow-next-function function-length` annotation is unchanged.

## Necessary cases

| Constraint                             | Requirement                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Implementing an fp primitive           | Using the helper inside itself would recurse, as in `capture`                                             |
| Fixed external protocol or API         | A real sentinel, callback signature, class/receiver or host-owned state is required                       |
| Proven type relationship               | Validation establishes an invariant that TypeScript cannot retain, such as a brand or correlated overload |
| Existing exception or cleanup contract | Returning Result or replacing finally would change required caller behavior                               |

The checker validates syntax and scope; code review must verify the reason. A type-only file
does not justify a boundary. The checker itself needs no allowances.

These examples belong in a documented `.b.ts` adapter:

```ts
export const protocolEmpty = () => {
  // @allow strict-fp/no-null -- The wire protocol requires a real null scalar; Option would change the payload.
  return null;
};
```

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

## Use instead

| Ordinary case                          | Replacement                                                   |
| -------------------------------------- | ------------------------------------------------------------- |
| External exceptions                    | `capture` / `captureAsync`, or their `captureResult` variants |
| Expected failure                       | `err`, then `match`, `mapError` or `flatMap`                  |
| Absence or uncertain collection access | `fromNullable`, `at` / `lookup`, then handle Option           |
| Untrusted data or casts                | `unknown`, guards and a Decoder; `branded` after validation   |
| JSON conversion                        | `decodeJson` / `encodeJson` with a codec                      |
| More than three owned parameters       | A named readonly parameter object                             |

Use readonly data, explicit inputs and local state for ordinary class, receiver and mutation code.
For Result-based resource handling, capture the main operation and each cleanup, then combine them
with `completeWithCleanup`. It preserves both failures and does not execute cleanup itself.
See the [tested examples](../packages/check/tests/fixtures/allow-examples.b.ts) for cleanup and absence.
