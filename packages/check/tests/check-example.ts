import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewProject, reviewSummary } from '#tests/fixtures/check-example';
import { failure, success } from '#tests/fixtures/result';
import { withProject } from '#tests/fixtures/project';

it('demonstrates configuration decoding, Result composition and diagnostics without throwing', async () => {
  await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
    expect(success(await reviewProject(root, {}))).toEqual({ diagnostics: [], passed: true });
    expect(await reviewSummary(root, {})).toBe('Checks passed.');
    expect(failure(await reviewProject(root, { unknown: true }))).toMatchObject({
      code: 'invalid-config',
    });
    expect(await reviewSummary(root, { unknown: true })).toContain('Unknown configuration option');
  });
  await withProject({ 'src/a.ts': 'export const f=()=>null;' }, async (root) => {
    expect(success(await reviewProject(root, {})).passed).toBe(false);
    expect(await reviewSummary(root, {})).toContain('diagnostics.');
  });
});
it('keeps the documented example identical to the typechecked fixture', () => {
  const example = readFileSync(new URL('fixtures/check-example.ts', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n')
    .trim();
  const guide = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  expect(guide).toContain(example);
});
