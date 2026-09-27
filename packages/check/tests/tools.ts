import { failureText, success } from '#tests/fixtures/result';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkProject,
  checkStaged,
  explainRule,
  initializeProject,
  typecheckProject,
} from '@ts-calm/check';
import { withProject, write, initializeGit, git } from '#tests/fixtures/project';

const tsconfig = JSON.stringify({
  compilerOptions: { strict: true, target: 'ES2024', module: 'NodeNext', types: [] },
  include: ['src/**/*.ts'],
});
const base = { 'tsconfig.json': tsconfig };
const ownedRule =
  /^(?:commit-message|function-length|function-params|boundary|no-file-cycles|no-module-cycles|strict-fp|purity)(?:\/|$)/;
const onlyOwnedRules = (issues: readonly { rule: string }[]): boolean =>
  issues.every((issue) => ownedRule.test(issue.rule));

describe('complete static checking', () => {
  it('reports only the rules this tool owns', async () => {
    await withProject(
      {
        ...base,
        'src/a.ts':
          'export const name:string=42;\nexport function run(){Promise.resolve(1);return null;}',
      },
      async (root) => {
        const diagnostics = success(await checkProject(root));
        expect(onlyOwnedRules(diagnostics)).toBe(true);
        const absence = diagnostics.find((item) => item.rule === 'strict-fp/no-null');
        expect(absence?.help).toContain('fromNullable');
        expect(absence?.docs).toContain('ts-calm');
      },
    );
  });
  it('deduplicates overlapping checks and honors exact line boundary exceptions', async () => {
    for (const allowance of ['no-any'])
      await withProject(
        {
          ...base,
          'src/adapter.b.ts': `/**\n * @boundary Adapt an external untyped callback shape.\n */\n// @allow strict-fp/${allowance} -- External callback type cannot be expressed here.\nexport const adapter=(value:any)=>value;`,
        },
        async (root) => expect(success(await checkProject(root))).toEqual([]),
      );
    await withProject(
      { ...base, 'src/a.ts': 'export const f=(value:any)=>value;' },
      async (root) => {
        expect(
          success(await checkProject(root)).filter((item) => item.rule.includes('any')),
        ).toHaveLength(1);
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":{"no-any":false}}}');
        expect(success(await checkProject(root))).toEqual([]);
      },
    );
  });
  it('does not skip a missing compiler configuration', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) =>
      expect(failureText(typecheckProject(root))).toContain('tsconfig.json is missing'),
    );
  });
});

describe('initialization and guidance', () => {
  it('leaves existing manifests and project files untouched', async () => {
    await withProject(
      {
        ...base,
        'package.json':
          '{"type":"commonjs","packageManager":"pnpm@11.22.0","workspaces":["packages/*"],"dependencies":{"example":"1.0.0"}}',
      },
      async (root) => {
        const paths = ['package.json', 'tsconfig.json'];
        const before = paths.map((path) => readFileSync(join(root, path)));
        const result = success(await initializeProject(root));
        expect(result.created).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.warnings[0]).toContain('commonjs');
        expect(paths.map((path) => readFileSync(join(root, path)))).toEqual(before);
      },
    );
  });
  it('creates only the ESM manifest and no compiler configuration', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
      rmSync(join(root, 'package.json'));
      expect(success(await initializeProject(root))).toEqual({
        created: ['package.json'],
        updated: [],
        warnings: [],
      });
      expect(existsSync(join(root, 'tsconfig.json'))).toBe(false);
      const written = readFileSync(join(root, 'package.json'), 'utf8');
      expect(JSON.parse(written)).toEqual({ type: 'module' });
      expect(written.endsWith('\n')).toBe(true);
      expect(success(await initializeProject(root))).toEqual({
        created: [],
        updated: [],
        warnings: [],
      });
    });
  });
  it('explains existing helpers before suggesting raw syntax exceptions', () => {
    expect(explainRule('strict-fp/no-try')).toContain('captureResult');
    expect(explainRule('strict-fp/no-null')).toContain('fromNullable');
    expect(explainRule('strict-fp/no-assertion')).toContain('isArray');
    expect(explainRule('absent')).toBe('');
  });
});

it('runs the source rules against the staged snapshot rather than the working tree', async () => {
  await withProject({ ...base, 'src/a.ts': 'export const a:string="valid";' }, async (root) => {
    initializeGit(root);
    write(root, 'src/a.ts', 'export const value=null;');
    git(root, 'add', 'src/a.ts');
    const index = git(root, 'ls-files', '--stage', '-z');
    const issues = success(await checkStaged(root));
    expect(issues.some((item) => item.rule === 'strict-fp/no-null')).toBe(true);
    expect(onlyOwnedRules(issues)).toBe(true);
    expect(git(root, 'ls-files', '--stage', '-z')).toBe(index);
  });
});

it('reports compiler errors from the typecheck command', async () => {
  await withProject({ ...base, 'src/a.ts': 'export const a:string=1;' }, async (root) => {
    expect(success(typecheckProject(root)).some((item) => item.rule === 'typecheck/TS2322')).toBe(
      true,
    );
  });
});
