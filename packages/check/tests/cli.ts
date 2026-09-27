import { afterEach, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { checkStaged, checkSourceProject } from '@ts-calm/check';
import { withProject, write, initializeGit } from '#tests/fixtures/project';

const originalArguments = process.argv;
const originalExitCode = process.exitCode;
afterEach(() => {
  process.argv = originalArguments;
  process.exitCode = originalExitCode;
  vi.doUnmock('#src/project');
  vi.restoreAllMocks();
});

const run = async (args: readonly string[]) => {
  vi.resetModules();
  process.argv = [process.execPath, 'ts-calm', ...args];
  process.exitCode = 0;
  const output: string[] = [],
    errors: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value));
  });
  vi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  await import('#src/cli.b');
  return { code: process.exitCode, output: output.join('\n'), errors: errors.join('\n') };
};
const base = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2024', module: 'NodeNext', types: [] },
    include: ['src/**/*.ts'],
  }),
  'src/a.ts': 'export const f=()=>1;',
};

it.each([
  ['--help'],
  ['-h'],
  ['--version'],
  ['explain', 'function-params'],
  ['explain', 'function-params', '--json'],
])('prints guidance for %j', async (...args) => {
  const result = await run(args);
  expect(result.code).toBe(0);
  expect(result.output).not.toBe('');
});
it.each([
  [],
  ['check', '--unknown'],
  ['check', '--cwd'],
  ['check', '--cwd', '--json'],
  ['commit-message', '--file'],
  ['explain', 'missing-rule'],
])('reports invalid arguments %j', async (...args) => {
  const result = await run(args);
  expect(result.code).toBe(2);
  expect(result.errors || result.output).not.toBe('');
});
it('keeps operational errors structured in JSON mode', async () => {
  const result = await run(['check', '--unknown', '--json']);
  expect(result.code).toBe(2);
  expect(JSON.parse(result.output)).toMatchObject({
    error: { kind: 'operational', message: expect.stringContaining('Unknown argument') },
  });
});
it('checks working sources, initialization and typechecking through the source CLI', async () => {
  await withProject(base, async (root) => {
    expect((await run(['check', '--cwd', root])).output).toBe('All checks passed.');
    expect((await run(['init', '--cwd', root])).output).toContain('Created:');
    expect(JSON.parse((await run(['init', '--cwd', root, '--json'])).output)).toHaveProperty(
      'updated',
    );
    expect((await run(['typecheck', '--cwd', root, '--json'])).code).toBe(0);
    write(root, 'src/a.ts', 'export const f=(a:number,b:number,c:number,d:number)=>[a,b,c,d];');
    const failure = await run(['check', '--cwd', root, '--json']);
    expect(failure.code).toBe(1);
    expect(JSON.parse(failure.output)).toContainEqual(
      expect.objectContaining({ rule: 'function-params' }),
    );
    expect((await run(['check', '--cwd', root])).output).toContain('maximum 3');
  });
});
it('honors staged line allowances while reporting an unallowed working-tree occurrence', async () => {
  const adapter =
    '/** @boundary Match the vendor callback signature. */\n// @allow function-params -- Vendor requires four arguments.\nexport const f=(a:number,b:number,c:number,d:number)=>[a,b,c,d];';
  await withProject({ ...base, 'src/adapter.b.ts': adapter }, async (root) => {
    initializeGit(root);
    expect(await checkStaged(root)).toEqual([]);
    write(
      root,
      'src/adapter.b.ts',
      adapter + '\nexport const g=(a:number,b:number,c:number,d:number)=>[a,b,c,d];',
    );
    expect((await checkSourceProject(root)).map((issue) => issue.rule)).toContain(
      'function-params',
    );
    expect((await run(['check', '--staged', '--cwd', root, '--json'])).code).toBe(0);
    write(root, 'message', 'check - verify line allowances');
    expect(
      (await run(['commit-message', '--cwd', root, '--file', join(root, 'message')])).code,
    ).toBe(0);
  });
});
it.each([new Error('external failure'), 'non-error failure'])(
  'preserves operational failure rendering: %s',
  async (failure) => {
    vi.doMock('#src/project', () => ({ checkProject: async () => Promise.reject(failure) }));
    const result = await run(['check']);
    expect(result.code).toBe(2);
    expect(result.errors).toBe(
      failure instanceof Error ? failure.message : 'Check execution failed.',
    );
  },
);
