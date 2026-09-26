import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, initializeGit, withProject, write } from '#tests/fixtures/project';
import {
  checkSourceProject as checkProject,
  checkStaged,
  checkStagedMessage,
  withStagedProject,
} from '@ts-calm/check';

const base = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2024', module: 'NodeNext', types: [] },
    include: ['src/**/*.ts'],
  }),
};

const inspectStaged = (root: string) =>
  withStagedProject(root, (snapshot) => checkProject(snapshot));

describe('staged snapshots', () => {
  it('checks staged bytes and preserves partially staged worktree/index content', async () => {
    await withProject({ ...base, 'src/a.ts': 'export const value=1;' }, async (root) => {
      initializeGit(root);
      write(root, 'src/a.ts', 'export const value=null; import "./absent.ts";');
      const index = git(root, 'ls-files', '--stage', '-z');
      const worktree = readFileSync(join(root, 'src/a.ts'));
      expect(await inspectStaged(root)).toEqual([]);
      expect((await checkProject(root)).length).toBeGreaterThan(0);
      expect(git(root, 'ls-files', '--stage', '-z')).toBe(index);
      expect(readFileSync(join(root, 'src/a.ts'))).toEqual(worktree);
    });
  });
  it('links the installed dependencies of a staged workspace package', async () => {
    await withProject(
      {
        ...base,
        '.gitignore': 'node_modules/\n',
        'packages/app/package.json': JSON.stringify({
          name: '@workspace/app',
          private: true,
          type: 'module',
        }),
        'packages/app/node_modules/dep/package.json': JSON.stringify({
          name: 'dep',
          type: 'module',
          main: 'index.js',
        }),
        'packages/app/node_modules/dep/index.js': 'export const dep = 1;\n',
        'packages/app/src/a.ts': 'import { dep } from "dep";\nexport const value = dep;\n',
      },
      async (root) => {
        initializeGit(root);
        expect(await inspectStaged(root)).toEqual([]);
      },
    );
  });
  it('uses the staged configuration in both check directions', async () => {
    await withProject(
      {
        ...base,
        'ts-calm.config.ts': 'export default {rules:{"strict-fp":false}}',
        'src/a.ts': 'export const value=null;',
      },
      async (root) => {
        initializeGit(root);
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":true}}');
        expect(await inspectStaged(root)).toEqual([]);
        git(root, 'add', 'ts-calm.config.ts');
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":false}}');
        expect((await inspectStaged(root)).map((issue) => issue.rule)).toContain(
          'strict-fp/no-null',
        );
      },
    );
  });
  it('checks the whole index graph including unchanged sources, renames and deletions', async () => {
    await withProject(
      {
        ...base,
        'src/a.ts': 'export const a=1;',
        'src/b.ts': 'export {a} from "./a.ts";',
      },
      async (root) => {
        initializeGit(root);
        git(root, 'commit', '-m', 'root - add initial');
        write(root, 'src/a.ts', 'export {a} from "./b.ts";');
        git(root, 'add', 'src/a.ts');
        expect((await inspectStaged(root)).map((issue) => issue.rule)).toContain('no-file-cycles');
        git(root, 'mv', 'src/b.ts', 'src/renamed.ts');
        expect((await inspectStaged(root)).map((issue) => issue.rule)).toContain('imports/resolve');
        rmSync(join(root, 'src/renamed.ts'));
        git(root, 'add', '-A');
        expect((await inspectStaged(root)).map((issue) => issue.rule)).toContain('imports/resolve');
      },
    );
  });
  it('refuses an entry a source snapshot cannot represent', async () => {
    await withProject({ ...base, 'src/a.ts': 'export const a=null;' }, async (root) => {
      initializeGit(root);
      const object = git(root, 'rev-parse', ':src/a.ts').trim();
      git(root, 'update-index', '--add', '--cacheinfo', `120000,${object},link`);
      await expect(checkStaged(root)).rejects.toThrow('cannot be inspected as a source snapshot');
    });
  });
  it('detects concurrent changes to the index without reverting them', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
      initializeGit(root);
      await expect(
        withStagedProject(root, async () => {
          write(root, 'src/a.ts', 'export const a=2;');
          git(root, 'add', 'src/a.ts');
        }),
      ).rejects.toThrow('Git index changed');
      expect(git(root, 'show', ':src/a.ts')).toContain('a=2');
    });
  });
  it('uses staged commit policy and does not need module manifests', async () => {
    await withProject(
      { 'ts-calm.config.ts': 'export default {rules:{"commit-message":{scopes:["fp"]}}}' },
      async (root) => {
        initializeGit(root);
        expect(await checkStagedMessage(root, 'fp - fix update')).toEqual([]);
        expect(
          (await checkStagedMessage(root, 'check - fix update')).map((issue) => issue.rule),
        ).toContain('commit-message/scope');
      },
    );
  });
});

describe('CLI exit codes', () => {
  const cli = fileURLToPath(new URL('../src/cli.b.ts', import.meta.url));
  const invoke = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, ['--conditions=ts-calm-source', cli, ...args, '--cwd', root], {
      encoding: 'utf8',
      windowsHide: true,
    });
  it('distinguishes successful checks, rule failures and operational errors', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
      write(
        root,
        'tsconfig.json',
        '{"compilerOptions":{"strict":true,"module":"NodeNext","target":"ES2024","types":[]},"include":["src/**/*.ts"]}',
      );
      expect(invoke(root, 'check').status).toBe(0);
      write(root, 'src/a.ts', 'export const a=null;');
      const failed = invoke(root, 'check', '--json');
      expect(failed.status).toBe(1);
      expect(JSON.parse(failed.stdout)).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'strict-fp/no-null' })]),
      );
      expect(invoke(root, 'check', '--staged').status).toBe(2);
      expect(invoke(root, 'check', '--unknown').status).toBe(2);
    });
  });
});
