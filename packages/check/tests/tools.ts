import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lintProject,
  checkProject,
  checkStaged,
  explainRule,
  formatProject,
  initializeProject,
  typecheckProject,
} from '@ts-calm/check';
import { withProject, write, initializeGit, git } from '#tests/fixtures/project';

const tsconfig = JSON.stringify({
  compilerOptions: { strict: true, target: 'ES2024', module: 'NodeNext', types: [] },
  include: ['src/**/*.ts'],
});
const base = { 'tsconfig.json': tsconfig };
const baselineLint = JSON.stringify({
  plugins: ['typescript'],
  rules: {
    'typescript/no-floating-promises': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },
});

describe('complete static checking', () => {
  it('reports source rules only, leaving formatting and linting to their own tools', async () => {
    await withProject(
      {
        ...base,
        '.oxlintrc.json': baselineLint,
        'src/a.ts':
          'export const name:string=42;\nexport function run(){Promise.resolve(1);return null;}',
      },
      async (root) => {
        const diagnostics = await checkProject(root);
        expect(diagnostics.some((item) => item.rule === 'fmt/format')).toBe(false);
        expect(diagnostics.some((item) => item.rule.includes('no-floating-promises'))).toBe(false);
        expect(diagnostics.some((item) => item.rule === 'typecheck/TS2322')).toBe(false);
        const absence = diagnostics.find((item) => item.rule === 'strict-fp/no-null');
        expect(absence?.help).toContain('fromNullable');
        expect(absence?.docs).toContain('ts-calm');
      },
    );
  });
  it('deduplicates overlapping checks and honors narrow and broad boundary exceptions', async () => {
    for (const allowance of ['no-any', '*'])
      await withProject(
        {
          ...base,
          '.oxlintrc.json': baselineLint,
          'src/adapter.b.ts': `/**\n * @boundary Adapt an external untyped callback shape.\n * @allow strict-fp/${allowance} -- External callback type cannot be expressed here.\n */\nexport const adapter=(value:any)=>value;`,
        },
        async (root) => {
          await formatProject(root, false);
          expect(await checkProject(root)).toEqual([]);
        },
      );
    await withProject(
      { ...base, '.oxlintrc.json': baselineLint, 'src/a.ts': 'export const f=(value:any)=>value;' },
      async (root) => {
        await formatProject(root, false);
        expect((await checkProject(root)).filter((item) => item.rule.includes('any'))).toHaveLength(
          1,
        );
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":{"no-any":false}}}');
        await formatProject(root, false, ['ts-calm.config.ts']);
        expect(await checkProject(root)).toEqual([]);
      },
    );
  });
  it('keeps Promise lint independent of a broad strict-fp exception', async () => {
    await withProject(
      {
        ...base,
        '.oxlintrc.json': baselineLint,
        'src/a.b.ts':
          '/**\n * @boundary Adapt external callbacks.\n * @allow strict-fp/* -- A nullable callback result must be normalized.\n */\nexport function f(){Promise.resolve(1);return null;}',
      },
      async (root) =>
        expect(lintProject(root).some((item) => item.rule.includes('no-floating-promises'))).toBe(
          true,
        ),
    );
  });
  it('does not skip a missing compiler configuration or invalid tool configuration', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) =>
      expect(() => typecheckProject(root)).toThrow('ts-calm init'),
    );
    await withProject({ ...base, '.oxlintrc.json': '{' }, async (root) =>
      expect(() => lintProject(root)).toThrow(),
    );
  });
  it('uses the local formatter configuration and keeps checking read-only', async () => {
    await withProject(
      {
        ...base,
        '.oxfmtrc.json': '{"singleQuote":false}',
        'src/a.ts': 'export const a = "value";\n',
      },
      async (root) => {
        await formatProject(root, false);
        const before = readFileSync(join(root, 'src/a.ts'));
        expect(await formatProject(root)).toEqual([]);
        expect(readFileSync(join(root, 'src/a.ts'))).toEqual(before);
      },
    );
  });
});

describe('initialization and guidance', () => {
  it('leaves existing configs, package manager, dependencies and workspace settings untouched', async () => {
    await withProject(
      {
        ...base,
        '.oxlintrc.jsonc': '{}',
        '.oxfmtrc.jsonc': '{}',
        'package.json':
          '{"type":"commonjs","packageManager":"pnpm@11.22.0","workspaces":["packages/*"],"dependencies":{"example":"1.0.0"}}',
      },
      async (root) => {
        const paths = ['package.json', 'tsconfig.json', '.oxlintrc.jsonc', '.oxfmtrc.jsonc'];
        const before = paths.map((path) => readFileSync(join(root, path)));
        const result = await initializeProject(root);
        expect(result.created).toEqual([]);
        expect(result.updated).toEqual([]);
        expect(result.warnings[0]).toContain('commonjs');
        expect(paths.map((path) => readFileSync(join(root, path)))).toEqual(before);
      },
    );
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
    const issues = await checkStaged(root);
    expect(issues.some((item) => item.rule === 'strict-fp/no-null')).toBe(true);
    expect(issues.some((item) => item.rule === 'fmt/format')).toBe(false);
    expect(git(root, 'ls-files', '--stage', '-z')).toBe(index);
  });
});

it('reports compiler errors from the typecheck command', async () => {
  await withProject({ ...base, 'src/a.ts': 'export const a:string=1;' }, async (root) => {
    expect(typecheckProject(root).some((item) => item.rule === 'typecheck/TS2322')).toBe(true);
  });
});
