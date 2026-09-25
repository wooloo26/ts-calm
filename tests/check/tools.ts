import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProject, checkLint } from '../../src/check/project.ts';
import { checkStaged } from '../../src/check/staged.b.ts';
import { formatProject, typecheckProject } from '../../src/check/tools.b.ts';
import { initializeProject } from '../../src/check/init.b.ts';
import { explainRule } from '../../src/check/rule-help.ts';
import { withProject, write, initializeGit, git } from '../../fixtures/project.ts';

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
  it('reports formatting, type-aware lint, compiler errors and custom rules in the same check', () => {
    withProject(
      {
        ...base,
        '.oxlintrc.json': baselineLint,
        'src/a.ts':
          'export const name:string=42;\nexport function run(){Promise.resolve(1);return null;}',
      },
      (root) => {
        const diagnostics = checkProject(root);
        expect(diagnostics.some((item) => item.rule === 'fmt/format')).toBe(true);
        expect(diagnostics.some((item) => item.rule.includes('no-floating-promises'))).toBe(true);
        expect(diagnostics.some((item) => item.rule === 'typecheck/TS2322')).toBe(true);
        const absence = diagnostics.find((item) => item.rule === 'strict-fp/no-null');
        expect(absence?.help).toContain('fromNullable');
        expect(absence?.docs).toContain('ts-calm');
      },
    );
  });
  it('deduplicates overlapping checks and honors narrow and broad boundary exceptions', () => {
    for (const allowance of ['no-any', '*'])
      withProject(
        {
          ...base,
          '.oxlintrc.json': baselineLint,
          'src/adapter.b.ts': `/**\n * @boundary Adapt an external untyped callback shape.\n * @allow strict-fp/${allowance} -- External callback type cannot be expressed here.\n */\nexport const adapter=(value:any)=>value;`,
        },
        (root) => expect(checkLint(root)).toEqual([]),
      );
    withProject(
      { ...base, '.oxlintrc.json': baselineLint, 'src/a.ts': 'export const f=(value:any)=>value;' },
      (root) => {
        expect(checkLint(root).filter((item) => item.rule.includes('any'))).toHaveLength(1);
        write(root, 'ts-calm.config.ts', 'export default {rules:{"strict-fp":{"no-any":false}}}');
        expect(checkLint(root)).toEqual([]);
      },
    );
  });
  it('keeps Promise lint independent of a broad strict-fp exception', () => {
    withProject(
      {
        ...base,
        '.oxlintrc.json': baselineLint,
        'src/a.b.ts':
          '/**\n * @boundary Adapt external callbacks.\n * @allow strict-fp/* -- A nullable callback result must be normalized.\n */\nexport function f(){Promise.resolve(1);return null;}',
      },
      (root) =>
        expect(checkLint(root).some((item) => item.rule.includes('no-floating-promises'))).toBe(
          true,
        ),
    );
  });
  it('does not skip a missing compiler configuration or invalid tool configuration', () => {
    withProject({ 'src/a.ts': 'export const a=1;' }, (root) =>
      expect(() => typecheckProject(root)).toThrow('ts-calm init'),
    );
    withProject({ ...base, '.oxlintrc.json': '{' }, (root) =>
      expect(() => checkLint(root)).toThrow(),
    );
  });
  it('uses the local formatter configuration and keeps checking read-only', () => {
    withProject(
      {
        ...base,
        '.oxfmtrc.json': '{"singleQuote":false}',
        'src/a.ts': 'export const a = "value";\n',
      },
      (root) => {
        formatProject(root, false);
        const before = readFileSync(join(root, 'src/a.ts'));
        expect(formatProject(root)).toEqual([]);
        expect(readFileSync(join(root, 'src/a.ts'))).toEqual(before);
      },
    );
  });
});

describe('initialization and guidance', () => {
  it('leaves existing configs, package manager, dependencies and workspace settings untouched', () => {
    withProject(
      {
        ...base,
        '.oxlintrc.jsonc': '{}',
        '.oxfmtrc.jsonc': '{}',
        'package.json':
          '{"type":"commonjs","packageManager":"pnpm@11.22.0","workspaces":["packages/*"],"dependencies":{"example":"1.0.0"}}',
      },
      (root) => {
        const paths = ['package.json', 'tsconfig.json', '.oxlintrc.jsonc', '.oxfmtrc.jsonc'];
        const before = paths.map((path) => readFileSync(join(root, path)));
        const result = initializeProject(root);
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

it('runs fmt, lint and tsc against staged source/config rather than the working tree', () => {
  withProject(
    { ...base, '.oxlintrc.json': baselineLint, 'src/a.ts': 'export const a:string="valid";' },
    (root) => {
      formatProject(root, false);
      initializeGit(root);
      write(
        root,
        'src/a.ts',
        'export const a:string=1;export function run(){Promise.resolve(1);return null;}',
      );
      write(root, '.oxlintrc.json', '{');
      write(root, 'tsconfig.json', '{');
      const index = git(root, 'ls-files', '--stage', '-z');
      expect(checkStaged(root)).toEqual([]);
      expect(git(root, 'ls-files', '--stage', '-z')).toBe(index);
      write(root, '.oxlintrc.json', baselineLint);
      write(root, 'tsconfig.json', tsconfig);
      git(root, 'add', 'src/a.ts');
      write(root, 'src/a.ts', 'export const a:string="fixed";');
      const issues = checkStaged(root);
      expect(issues.some((item) => item.rule === 'fmt/format')).toBe(true);
      expect(issues.some((item) => item.rule.includes('no-floating-promises'))).toBe(true);
      expect(issues.some((item) => item.rule === 'typecheck/TS2322')).toBe(true);
    },
  );
});
