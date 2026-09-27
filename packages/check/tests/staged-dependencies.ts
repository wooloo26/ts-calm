import { failureText, success } from '#tests/fixtures/result';
import { expect, it } from 'vitest';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkStaged, checkStagedMessage } from '@ts-calm/check';
import { git, initializeGit, withProject, write } from '#tests/fixtures/project';

const policy = (strict: boolean) =>
  `export default { rules: { 'strict-fp': ${strict}, 'commit-message': { scopes: ['${strict ? 'strict' : 'loose'}'] } } };`;
const fixture = (strict: boolean) => ({
  '.gitignore': 'node_modules/\n',
  'packages/policy/package.json': JSON.stringify({
    name: '@workspace/policy',
    type: 'module',
    exports: './index.ts',
  }),
  'packages/policy/index.ts': policy(strict),
  'ts-calm.config.ts': 'import policy from "@workspace/policy"; export default policy;',
  'src/a.ts': 'export const value = null;',
});
const install = (root: string) => {
  mkdirSync(join(root, 'node_modules/@workspace'), { recursive: true });
  symlinkSync(
    join(root, 'packages/policy'),
    join(root, 'node_modules/@workspace/policy'),
    'junction',
  );
};

it.each([true, false])('uses staged workspace policy when strict=%s', async (strict) => {
  await withProject(fixture(strict), async (root) => {
    install(root);
    initializeGit(root);
    const before = git(root, 'ls-files', '--stage', '-z');
    write(root, 'packages/policy/index.ts', policy(!strict));
    const issues = success(await checkStaged(root));
    expect(issues.some((issue) => issue.rule === 'strict-fp/no-null')).toBe(strict);
    expect(
      success(await checkStagedMessage(root, `${strict ? 'strict' : 'loose'} - validate policy`)),
    ).toEqual([]);
    expect(git(root, 'ls-files', '--stage', '-z')).toBe(before);
  });
});

it('does not fall back to a workspace package absent from the index', async () => {
  await withProject(fixture(true), async (root) => {
    install(root);
    initializeGit(root);
    git(root, 'rm', '--cached', '-r', 'packages/policy');
    expect(failureText(await checkStaged(root))).toMatch(/snapshot|staged/i);
  });
});

it('does not read an unstaged workspace export target', async () => {
  await withProject(fixture(true), async (root) => {
    install(root);
    initializeGit(root);
    git(root, 'rm', '--cached', 'packages/policy/index.ts');
    expect(failureText(await checkStaged(root))).not.toBe('');
  });
});

it('uses staged package bytes even when the working tree package was removed', async () => {
  await withProject(fixture(true), async (root) => {
    install(root);
    initializeGit(root);
    const target = join(root, 'packages/policy');
    expect(target.startsWith(root)).toBe(true);
    rmSync(target, { recursive: true });
    expect(
      success(await checkStaged(root)).some((issue) => issue.rule === 'strict-fp/no-null'),
    ).toBe(true);
  });
});

it('reports a broken external dependency instead of creating a dangling snapshot link', async () => {
  await withProject(
    { '.gitignore': 'node_modules/\n', 'src/a.ts': 'export const a=1;' },
    async (root) => {
      const store = join(root, 'node_modules/.store/missing');
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      symlinkSync(store, join(root, 'node_modules/missing'), 'junction');
      initializeGit(root);
      expect(failureText(await checkStaged(root))).not.toBe('');
    },
  );
});
