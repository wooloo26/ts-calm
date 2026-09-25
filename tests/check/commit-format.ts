import { expect, it } from 'vitest';
import { validateCommitMessage } from '#check/commit-message';

it('honors explicit rule, ASCII, scope and length settings', () => {
  expect(validateCommitMessage('anything', { rules: { 'commit-message': false } })).toEqual([]);
  expect(
    validateCommitMessage('fp - add 中文', {
      rules: { 'commit-message': { ascii: false, scopes: ['fp'] } },
    }),
  ).toEqual([]);
  expect(
    validateCommitMessage('fp - add value', { rules: { 'commit-message': { scopes: ['fp'] } } }),
  ).toEqual([]);
  expect(
    validateCommitMessage('fp - add long description', {
      rules: { 'commit-message': { maxLength: 20 } },
    }).some((item) => item.rule === 'commit-message/format'),
  ).toBe(true);
  const diagnostics = validateCommitMessage('中 - add value', {}, 'message.txt');
  expect(diagnostics.find((item) => item.rule === 'commit-message/ascii')).toMatchObject({
    file: 'message.txt',
    line: 1,
    column: 1,
  });
});

it('uses scope - verb description and rejects the previous grammar', () => {
  expect(validateCommitMessage('fp - add safe array guards')).toEqual([]);
  expect(
    validateCommitMessage('feat(fp): add safe array guards').some(
      (item) => item.rule === 'commit-message/format',
    ),
  ).toBe(true);
  expect(
    validateCommitMessage('fp - feat safe array guards').some(
      (item) => item.rule === 'commit-message/format',
    ),
  ).toBe(true);
  expect(
    validateCommitMessage('other - fix a bug', {
      rules: { 'commit-message': { scopes: ['fp'] } },
    }).some((item) => item.rule === 'commit-message/scope'),
  ).toBe(true);
});

it('applies the exact subject length and validates body ASCII', () => {
  const prefix = 'root - fix ';
  expect(validateCommitMessage(prefix + 'x'.repeat(100 - prefix.length))).toEqual([]);
  expect(
    validateCommitMessage(prefix + 'x'.repeat(101 - prefix.length)).map((issue) => issue.rule),
  ).toContain('commit-message/format');
  expect(
    validateCommitMessage('root - fix valid\n\n非 ASCII').map((issue) => issue.rule),
  ).toContain('commit-message/ascii');
});
it('accepts explicit scopes without module metadata', () => {
  expect(validateCommitMessage('check - add explain boundaries')).toEqual([]);
  expect(validateCommitMessage('check - add change API\n\nBREAKING CHANGE: new API')).toEqual([]);
  expect(validateCommitMessage('check - add 中文')[0]?.rule).toBe('commit-message/ascii');
  expect(validateCommitMessage('feat: no scope')[0]?.rule).toBe('commit-message/format');
  expect(
    validateCommitMessage('nope - fix update', {
      rules: { 'commit-message': { scopes: ['fp'] } },
    })[0]?.rule,
  ).toBe('commit-message/scope');
});
