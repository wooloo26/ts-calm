/**
 * @boundary Read effective TypeScript conditions using the pinned compiler rather than duplicating tsconfig inheritance.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects process
 * @allow strict-fp/no-throw -- Invalid compiler configuration cannot silently change import resolution.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { isArray, isPlainObject } from '@ts-calm/fp';

/** @impure Read filesystem configuration and cache the compiler's normalized conditions for this run. */
export const compilerConditions = (
  root: string,
  file: string,
  cache: Map<string, readonly string[]>,
): readonly string[] => {
  let directory = dirname(resolve(root, file)),
    config = '';
  const limit = resolve(root);
  while (directory.startsWith(limit)) {
    const candidate = join(directory, 'tsconfig.json');
    if (existsSync(candidate)) {
      config = candidate;
      break;
    }
    const parent = dirname(directory);
    if (parent === directory || directory === limit) break;
    directory = parent;
  }
  if (!config) return [];
  const saved = cache.get(config);
  if (saved) return saved;
  const load = createRequire(import.meta.url);
  const binary = join(dirname(load.resolve('typescript/package.json')), 'bin/tsc');
  const result = spawnSync(process.execPath, [binary, '--showConfig', '--project', config], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message ||
        result.stderr ||
        result.stdout ||
        'Cannot read TypeScript configuration.',
    );
  const data: unknown = JSON.parse(result.stdout);
  const options =
    isPlainObject(data) && isPlainObject(data['compilerOptions']) ? data['compilerOptions'] : {};
  const value = options['customConditions'];
  const conditions = isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  cache.set(config, conditions);
  return conditions;
};
