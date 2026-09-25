import { describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, initializeGit, withProject, write } from '#fixtures/project';
import { checkStagedMessage, withStagedProject } from '#check/staged.b';
import { checkSourceProject as checkProject } from '#check/sources.b';
import { formatProject } from '#check/tools.b';

const checkStaged = (root: string) => withStagedProject(root, checkProject);

describe('staged snapshots', () => {
  it('checks staged bytes and preserves partially staged worktree/index content', () => {
    withProject({ 'src/a.ts': 'export const value=1;' }, (root) => {
      initializeGit(root);
      write(root, 'src/a.ts', 'export const value=null; import "./absent.ts";');
      const index = git(root, 'ls-files', '--stage', '-z');
      const worktree = readFileSync(join(root, 'src/a.ts'));
      expect(checkStaged(root)).toEqual([]);
      expect(checkProject(root).length).toBeGreaterThan(0);
      expect(git(root, 'ls-files', '--stage', '-z')).toBe(index);
      expect(readFileSync(join(root, 'src/a.ts'))).toEqual(worktree);
    });
  });
  it('uses the staged configuration in both check directions', () => {
    withProject(
      {
        'ts-calm.config.ts': 'export default {rules:{"strict-fp":false}}',
        'src/a.ts': 'export const value=null;',
      },
      (root) => {
        initializeGit(root);
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":true}}');
        expect(checkStaged(root)).toEqual([]);
        git(root, 'add', 'ts-calm.config.ts');
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":false}}');
        expect(checkStaged(root).map((issue) => issue.rule)).toContain('strict-fp/no-null');
      },
    );
  });
  it('checks the whole index graph including unchanged sources, renames and deletions', () => {
    withProject(
      { 'src/a.ts': 'export const a=1;', 'src/b.ts': 'export {a} from "./a.ts";' },
      (root) => {
        initializeGit(root);
        git(root, 'commit', '-m', 'root - add initial');
        write(root, 'src/a.ts', 'export {a} from "./b.ts";');
        git(root, 'add', 'src/a.ts');
        expect(checkStaged(root).map((issue) => issue.rule)).toContain('no-file-cycles');
        git(root, 'mv', 'src/b.ts', 'src/renamed.ts');
        expect(checkStaged(root).map((issue) => issue.rule)).toContain('imports/resolve');
        rmSync(join(root, 'src/renamed.ts'));
        git(root, 'add', '-A');
        expect(checkStaged(root).map((issue) => issue.rule)).toContain('imports/resolve');
      },
    );
  });
  it('detects concurrent changes to the index without reverting them', () => {
    withProject({ 'src/a.ts': 'export const a=1;' }, (root) => {
      initializeGit(root);
      expect(() =>
        withStagedProject(root, () => {
          write(root, 'src/a.ts', 'export const a=2;');
          git(root, 'add', 'src/a.ts');
        }),
      ).toThrow('Git index changed');
      expect(git(root, 'show', ':src/a.ts')).toContain('a=2');
    });
  });
  it('uses staged commit policy and does not need module manifests', () => {
    withProject(
      { 'ts-calm.config.ts': 'export default {rules:{"commit-message":{scopes:["fp"]}}}' },
      (root) => {
        initializeGit(root);
        expect(checkStagedMessage(root, 'fp - fix update')).toEqual([]);
        expect(checkStagedMessage(root, 'check - fix update').map((issue) => issue.rule)).toContain(
          'commit-message/scope',
        );
      },
    );
  });
});

describe('CLI exit codes', () => {
  const cli = fileURLToPath(new URL('../../src/check/cli.b.ts', import.meta.url));
  const invoke = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, ['--conditions=ts-calm-source', cli, ...args, '--cwd', root], {
      encoding: 'utf8',
      windowsHide: true,
    });
  it('distinguishes successful checks, rule failures and operational errors', () => {
    withProject({ 'src/a.ts': 'export const a=1;' }, (root) => {
      write(
        root,
        'tsconfig.json',
        '{"compilerOptions":{"strict":true,"module":"NodeNext","target":"ES2024","types":[]},"include":["src/**/*.ts"]}',
      );
      formatProject(root, false);
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
