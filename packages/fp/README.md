# @ts-calm/fp

Calm defaults for functional TypeScript: Option and Result containers, shared combinators, safe
external-value guards and explicit serialization. Node 24+, ESM, MIT.

This package is the runtime. It has no runtime dependencies and `@types/node` is development-only,
so importing it never loads a formatter, linter or compiler.

## Use

This package lives at `packages/fp` in the template, and `pnpm install` links it as `@ts-calm/fp`;
there is nothing to add.

```ts
import { err, getOrElse, isArray, isNumber, match, ok, fromNullable } from '@ts-calm/fp';
import { captureAsync } from '@ts-calm/fp/boundary';

const label = match(fromNullable(externalName), {
  some: (value) => String(value),
  none: () => 'missing',
});
```

## Entry points

| Entry                  | Contents                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `@ts-calm/fp`          | Containers, combinators, collections, guards, codecs, data DTOs  |
| `@ts-calm/fp/boundary` | `capture`, `captureAsync`, `captureResult`, `captureResultAsync` |

The package is portable: its runtime modules import each other relatively and use no Node-only
subpath (`#`) mapping, so a bundler or browser can read the sources as published.

## What it guarantees

- Containers are frozen and carry no public fields; `isOk`, `isErr`, `isSome`, `isNone`,
  `isResult` and `isOption` reject structural lookalikes.
- Guards fail closed: a revoked or uninspectable proxy yields `false`, never a throw.
- `isNumber` accepts finite primitives only; `isNull` and `isUndefined` are sentinel checks, not
  a replacement for `fromNullable`.
- Serialization is explicit. `toResultData`, `toOptionData` and `encodeJson` publish only the
  documented DTO shapes.

Every exported symbol is documented and that coverage is enforced by a test in the workspace.
