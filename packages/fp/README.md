# @ts-calm/fp

Calm defaults for functional TypeScript: Option and Result containers, combinators, safe
external-value guards and explicit serialization. Node 24+, ESM, MIT, no runtime dependencies.

| Entry                  | Contents                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `@ts-calm/fp`          | Containers, combinators, collections, guards, codecs, data DTOs  |
| `@ts-calm/fp/boundary` | `capture`, `captureAsync`, `captureResult`, `captureResultAsync` |

```ts
import { fromNullable, match } from '@ts-calm/fp';

const externalName: unknown = 'Ada';
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

Containers belong to the module instance that created them. Spreading, proxying, or copying their
symbols does not create an authenticated container; use constructors or the explicit DTO decoders.
Only the container is frozen: payloads remain the caller's values by reference.

`lookup` accepts dictionaries and native Maps, including Maps from another realm. A custom object
with `get`/`has` methods remains a dictionary. Convert a custom map implementation with
`new Map(custom.entries())` before using the Map overload.

## Input to output

This example is compiled and tested in `tests/fixtures/profile.ts`. A domain validation error stays
distinct from JSON parsing or serialization errors. Callers can use `match` to render either branch.

```ts
import {
  decodeJson,
  encodeJson,
  err,
  flatMap,
  hasOwn,
  isNumber,
  isString,
  map,
  ok,
} from '@ts-calm/fp';
import type { Decoder, JsonCodec } from '@ts-calm/fp';

type Profile = Readonly<{ name: string; score: number }>;
const decodeProfile: Decoder<Profile, 'invalid-profile'> = (input) => {
  if (!hasOwn(input, 'name') || !isString(input.name)) return err('invalid-profile');
  if (!hasOwn(input, 'score') || !isNumber(input.score)) return err('invalid-profile');
  const name = input.name.trim();
  return name ? ok({ name, score: input.score }) : err('invalid-profile');
};
const profileCodec: JsonCodec<Profile, 'invalid-profile'> = {
  decode: decodeProfile,
  encode: (profile) => ({ name: profile.name, score: profile.score }),
};

// Untrusted JSON -> validation -> domain transformation -> explicit JSON output.
export const awardPoint = (text: string) => {
  const decoded = decodeJson(text, profileCodec);
  const awarded = map(decoded, (profile) => ({ ...profile, score: profile.score + 1 }));
  return flatMap(awarded, (profile) => encodeJson(profile, profileCodec));
};
```

`awardPoint('{"name":" Ada ","score":1}')` succeeds with `'{"name":"Ada","score":2}'`.
An invalid profile returns `err('invalid-profile')`; malformed JSON returns a JSON issue.
