# @ts-calm/fp

Calm defaults for functional TypeScript: Option and Result containers, combinators, safe
external-value guards and explicit serialization. Node 24+, ESM, MIT, no runtime dependencies.

| Entry                  | Contents                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `@ts-calm/fp`          | Containers, combinators, collections, guards, codecs, data DTOs  |
| `@ts-calm/fp/boundary` | `capture`, `captureAsync`, `captureResult`, `captureResultAsync` |

```ts
import { fromNullable, getOrElse, match } from '@ts-calm/fp';
import { captureAsync } from '@ts-calm/fp/boundary';

const label = match(fromNullable(externalName), {
  some: (value) => String(value),
  none: () => 'missing',
});
```

Portable: runtime modules import each other relatively and use no Node-only `#` mapping, so a bundler
or browser reads the sources as they are.

## Guarantees

- Containers are frozen and carry no public fields; `isOk`, `isErr`, `isSome`, `isNone`, `isResult`
  and `isOption` reject structural lookalikes.
- Guards fail closed: a revoked or uninspectable proxy yields `false`, never a throw.
- `isNumber` accepts finite primitives only; `isNull` and `isUndefined` are sentinel checks, not a
  replacement for `fromNullable`.
- Serialization is explicit: `toResultData`, `toOptionData` and `encodeJson` publish only the
  documented DTO shapes.

Every exported symbol is documented and that coverage is enforced by a test in the workspace.
