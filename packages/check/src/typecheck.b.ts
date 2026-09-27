/**
 * @boundary Run the pinned compiler and remove its temporary cache, retaining both failure outcomes.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects node:os
 * @effects process
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { completeWithCleanup, err, get, isErr, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { capture } from '@ts-calm/fp/boundary';
import { typeDiagnostics } from '#src/compiler';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';
import type { Diagnostic } from '#src/core/types';

/** @impure Invoke the pinned compiler with a private build cache. */
const execute = (root: string, cache: string): Result<readonly Diagnostic[], CheckFailure> => {
  const invoked = capture(
    () => {
      const load = createRequire(import.meta.url);
      const binary = join(dirname(load.resolve('typescript/package.json')), 'bin/tsc');
      return spawnSync(
        process.execPath,
        [
          binary,
          '--project',
          resolve(root, 'tsconfig.json'),
          '--noEmit',
          '--pretty',
          'false',
          '--incremental',
          '--tsBuildInfoFile',
          join(cache, 'check.tsbuildinfo'),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 32 * 1024 * 1024,
          env: process.env,
        },
      );
    },
    { name: 'execute-typescript' },
  );
  if (isErr(invoked)) return invoked;
  const result = get(invoked);
  if (result.error)
    return err(
      issue(
        'command-failed',
        'execute-typescript',
        `Cannot start TypeScript: ${result.error.message}`,
      ),
    );
  if (result.signal)
    return err(
      issue('command-failed', 'execute-typescript', `Compiler terminated by ${result.signal}.`),
    );
  const diagnostics = typeDiagnostics(result.stdout, (file) =>
    (isAbsolute(file) ? relative(root, file) : file).replaceAll('\\', '/'),
  );
  return result.status !== 0 && diagnostics.length === 0
    ? err(
        issue(
          'command-failed',
          'execute-typescript',
          result.stderr || result.stdout || 'TypeScript failed.',
        ),
      )
    : ok(diagnostics);
};

/** @impure Execute the compiler and release this invocation's cache even after failure. */
export const typecheckProject = (root: string): Result<readonly Diagnostic[], CheckFailure> => {
  const exists = capture(() => existsSync(join(root, 'tsconfig.json')), {
    name: 'find-typescript-configuration',
  });
  if (isErr(exists)) return exists;
  if (!get(exists))
    return err(
      issue(
        'invalid-config',
        'typecheck',
        'tsconfig.json is missing. Provide a project configuration for typecheck.',
      ),
    );
  const temporary = capture(() => mkdtempSync(join(tmpdir(), 'ts-calm-types-')), {
    name: 'create-compiler-cache',
  });
  if (isErr(temporary)) return temporary;
  const directory = get(temporary);
  const result = execute(root, directory);
  const cleaned = capture(() => rmSync(directory, { recursive: true, force: true }), {
    name: 'remove-compiler-cache',
  });
  return completeWithCleanup(result, [cleaned]);
};
