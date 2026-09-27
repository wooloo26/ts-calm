import { afterEach, expect, it, vi } from 'vitest';
import { err, get, isSome, ok } from '@ts-calm/fp';
import { loadConfiguration, typecheckProject, withStagedProject } from '@ts-calm/check';
import { issue } from '#src/core/issues';
import { failure, success } from '#tests/fixtures/result';
import { initializeGit, withProject, write } from '#tests/fixtures/project';

const state = vi.hoisted(() => ({
  owned: [] as string[],
  removeCalls: 0,
  hookCalls: 0,
  failCleanup: false,
  compilerFailure: false,
  mode: '',
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdtempSync: (prefix: string) => {
      const directory = actual.mkdtempSync(prefix);
      state.owned.push(directory);
      return directory;
    },
    rmSync: (path: string, options: import('node:fs').RmOptions) => {
      if (state.owned.includes(path) && !path.includes('ts-calm-test-')) {
        state.removeCalls += 1;
        if (state.failCleanup) throw new Error('cleanup failed');
      }
      return actual.rmSync(path, options);
    },
  };
});
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => {
      if (state.mode === 'compiler')
        return {
          status: state.compilerFailure ? 1 : 0,
          stdout: '',
          stderr: state.compilerFailure ? 'compiler failed' : '',
          signal: null,
        };
      return actual.spawnSync(...args);
    },
  };
});
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    createRequire: actual.createRequire,
    registerHooks: (options: Parameters<typeof actual.registerHooks>[0]) => {
      const hooks = actual.registerHooks(options);
      return {
        deregister: () => {
          hooks.deregister();
          state.hookCalls += 1;
          if (state.mode === 'hook' && state.failCleanup) throw new Error('hook cleanup failed');
        },
      };
    },
  };
});
afterEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  for (const directory of state.owned) actual.rmSync(directory, { recursive: true, force: true });
  state.owned = [];
  state.removeCalls = 0;
  state.hookCalls = 0;
  state.failCleanup = false;
  state.compilerFailure = false;
  state.mode = '';
});

const outcomes = [
  { primary: false, cleanup: false },
  { primary: true, cleanup: false },
  { primary: false, cleanup: true },
  { primary: true, cleanup: true },
];
it.each(outcomes)('retains compiler and cleanup failures: %j', async (flags) => {
  state.mode = 'compiler';
  state.compilerFailure = flags.primary;
  state.failCleanup = flags.cleanup;
  await withProject({ 'tsconfig.json': '{}' }, (root) => {
    const result = typecheckProject(root);
    expect(state.removeCalls).toBe(1);
    if (!flags.primary && !flags.cleanup) expect(success(result)).toEqual([]);
    else {
      const problem = failure(result);
      expect(problem.code).toBe(flags.cleanup ? 'cleanup-failed' : 'command-failed');
      if (problem.code === 'cleanup-failed') {
        expect(isSome(problem.operationError)).toBe(flags.primary);
        expect(problem.cleanupErrors).toHaveLength(1);
        expect(problem.cleanupErrors[0]?.operation).toBe('remove-compiler-cache');
        if (isSome(problem.operationError))
          expect(get(problem.operationError)).toMatchObject({ message: 'compiler failed' });
      }
    }
  });
});
it.each(outcomes)('retains snapshot and cleanup failures: %j', async (flags) => {
  state.failCleanup = flags.cleanup;
  await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
    initializeGit(root);
    const inspect = vi.fn(() =>
      flags.primary
        ? err(issue('invalid-snapshot', 'test-inspection', 'primary failed'))
        : ok('inspected'),
    );
    const result = await withStagedProject(root, inspect);
    expect(inspect).toHaveBeenCalledOnce();
    expect(state.removeCalls).toBe(1);
    if (!flags.primary && !flags.cleanup) expect(success(result)).toBe('inspected');
    else {
      const problem = failure(result);
      expect(problem.code).toBe(flags.cleanup ? 'cleanup-failed' : 'invalid-snapshot');
      if (problem.code === 'cleanup-failed')
        expect(isSome(problem.operationError)).toBe(flags.primary);
    }
  });
});
it.each(outcomes)(
  'releases configuration hooks while retaining both failures: %j',
  async (flags) => {
    state.mode = 'hook';
    state.failCleanup = flags.cleanup;
    await withProject(
      {
        'ts-calm.config.ts': flags.primary
          ? 'throw new Error("config failed")'
          : 'export default {}',
      },
      (root) => {
        const result = loadConfiguration(root);
        expect(state.hookCalls).toBe(1);
        if (!flags.primary && !flags.cleanup) expect(success(result)).toEqual({});
        else {
          const problem = failure(result);
          expect(problem.code).toBe(flags.cleanup ? 'cleanup-failed' : 'unexpected-fault');
          if (problem.code === 'cleanup-failed')
            expect(isSome(problem.operationError)).toBe(flags.primary);
        }
      },
    );
  },
);
it('captures an unexpected inspection rejection and still removes the snapshot', async () => {
  await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) => {
    initializeGit(root);
    const result = await withStagedProject(root, () =>
      Promise.reject(new Error('unexpected callback failure')),
    );
    expect(failure(result)).toMatchObject({
      code: 'unexpected-fault',
      operation: 'inspect-snapshot',
      message: 'unexpected callback failure',
    });
    expect(state.removeCalls).toBe(1);
  });
});
it('uses the native ESM cache and releases the hook after every load attempt', async () => {
  await withProject({ 'ts-calm.config.ts': 'export default {files:["first.ts"]}' }, (root) => {
    expect(success(loadConfiguration(root)).files).toEqual(['first.ts']);
    write(root, 'ts-calm.config.ts', 'export default {files:["second.ts"]}');
    expect(success(loadConfiguration(root)).files).toEqual(['first.ts']);
    expect(state.hookCalls).toBe(2);
  });
});
