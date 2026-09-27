/**
 * @boundary Read effective TypeScript conditions using the pinned compiler rather than duplicating tsconfig inheritance.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects process
 */
import { inside } from '#src/core/paths';

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { err, get, isErr, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { capture } from '@ts-calm/fp/boundary';
import { compilerConditionsFromOutput } from '#src/compiler';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';

/** @impure Read filesystem configuration and cache the compiler's normalized conditions for this run. */
export const compilerConditions = (
  root: string,
  file: string,
  cache: Map<string, readonly string[]>,
): Result<readonly string[], CheckFailure> => {
  let directory = dirname(resolve(root, file)),
    config = '';
  const limit = resolve(root);
  while (inside(limit, directory)) {
    const candidate = join(directory, 'tsconfig.json');
    const exists = capture(() => existsSync(candidate), { name: 'find-tsconfig' });
    if (isErr(exists)) return exists;
    if (get(exists)) {
      config = candidate;
      break;
    }
    const parent = dirname(directory);
    if (parent === directory || directory === limit) break;
    directory = parent;
  }
  if (!config) return ok([]);
  const saved = cache.get(config);
  if (saved) return ok(saved);
  const executed = capture(
    () => {
      const load = createRequire(import.meta.url);
      const binary = join(dirname(load.resolve('typescript/package.json')), 'bin/tsc');
      return spawnSync(process.execPath, [binary, '--showConfig', '--project', config], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
    },
    { name: 'read-typescript-configuration' },
  );
  if (isErr(executed)) return executed;
  const result = get(executed);
  if (result.error || result.status !== 0)
    return err(
      issue(
        'command-failed',
        'read-typescript-configuration',
        result.error?.message ||
          result.stderr ||
          result.stdout ||
          'Cannot read TypeScript configuration.',
      ),
    );
  const conditions = compilerConditionsFromOutput(result.stdout);
  if (isErr(conditions)) return conditions;
  cache.set(config, get(conditions));
  return conditions;
};
