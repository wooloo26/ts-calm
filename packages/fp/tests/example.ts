import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get, getError, isErr, isOk } from '@ts-calm/fp';
import { awardPoint } from '#tests/fixtures/profile';

it('validates, transforms and serializes external data without losing errors', () => {
  const result = awardPoint('{"name":" Ada ","score":1}');
  expect(isOk(result) && get(result)).toBe('{"name":"Ada","score":2}');
  const invalid = awardPoint('{"name":false,"score":1}');
  expect(isErr(invalid) && getError(invalid)).toBe('invalid-profile');
  const malformed = awardPoint('{');
  expect(isErr(malformed) && getError(malformed)).toMatchObject({ code: 'invalid-json' });
});

it('keeps the README example identical to its typechecked implementation', () => {
  const source = readFileSync(new URL('./fixtures/profile.ts', import.meta.url), 'utf8').trim();
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  expect(readme).toContain(`\`\`\`ts\n${source}\n\`\`\``);
});
