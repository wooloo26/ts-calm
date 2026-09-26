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
