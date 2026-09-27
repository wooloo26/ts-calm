# @ts-calm/fp

Option, Result, combinators, guards and codecs. Node 24+, ESM, no runtime dependencies.

| Entry                  | Contents                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| `@ts-calm/fp`          | Containers, combinators, collections, guards and codecs          |
| `@ts-calm/fp/boundary` | `capture`, `captureAsync`, `captureResult`, `captureResultAsync` |

- Containers are frozen and authenticated by their module instance. Copies, proxies and structural
  lookalikes are not containers; payloads remain the caller's values. Use explicit DTOs for serialization.
- Guards return false for uninspectable proxies. `isNumber` accepts finite primitives;
  use `fromNullable` for absence and sentinel predicates only when the distinction matters.
- `lookup` accepts dictionaries and native Maps, including cross-realm Maps. Convert custom
  map implementations with `new Map(custom.entries())`.
- Runtime imports are relative and portable to browsers and bundlers.

## Input to output

This [tested example](tests/fixtures/profile.ts) keeps validation errors distinct from JSON failures:

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
Invalid input returns `err('invalid-profile')`; malformed JSON returns a JSON issue.
See [necessary allowances](../../docs/allow.md) for cases that helpers cannot replace.
