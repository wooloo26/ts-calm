/**
 * @boundary Load trusted configuration and release the native resolver hook after every attempt.
 * @effects node:fs
 * @effects node:module
 */
import { existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { completeWithCleanup, err, get, isErr, isPlainObject, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { capture, captureResult } from '@ts-calm/fp/boundary';
import { compilerConditions } from '#src/compiler-options.b';
import { validateConfiguration } from '#src/configuration';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';
import type { CheckConfig } from '#src/core/types';

/** @impure Search this directory and its ancestors for project configuration. */
const configurationPath = (root: string): string => {
  let directory = resolve(root);
  while (true) {
    const candidate = join(directory, 'ts-calm.config.ts');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return '';
    directory = parent;
  }
};

/** @impure Execute a trusted configuration module under its compiler conditions. */
const loadModule = (path: string): Result<unknown, CheckFailure> => {
  const conditions = compilerConditions(dirname(path), path, new Map());
  if (isErr(conditions)) return conditions;
  const prepared = capture(
    () => {
      const load = createRequire(import.meta.url);
      const hooks = registerHooks({
        resolve(specifier, context, next) {
          return next(specifier, {
            ...context,
            conditions: [...context.conditions, ...get(conditions)],
          });
        },
      });
      return { load, hooks };
    },
    { name: 'prepare-configuration-loader' },
  );
  if (isErr(prepared)) return prepared;
  const { load, hooks } = get(prepared);
  const loaded = capture((): unknown => load(path), { name: `load-configuration:${path}` });
  const cleaned = capture(() => hooks.deregister(), { name: 'release-configuration-hook' });
  return completeWithCleanup(loaded, [cleaned]);
};

/**
 * Read trusted configuration using Node's native module cache. Restart the calling process after
 * changing configuration; every CLI invocation already starts a fresh process.
 * @impure Read and execute trusted project configuration; failures are explicit values.
 */
export const loadConfiguration = (root: string): Result<CheckConfig, CheckFailure> => {
  const found = capture(() => configurationPath(root), { name: 'find-configuration' });
  if (isErr(found)) return found;
  const path = get(found);
  if (!path) return ok({});
  const loaded = loadModule(path);
  if (isErr(loaded)) return loaded;
  const module = get(loaded);
  if (!isPlainObject(module))
    return err(
      issue(
        'invalid-config',
        'load-configuration',
        'Configuration must contain objects, not null or arrays.',
      ),
    );
  return captureResult(() => validateConfiguration(module['default'] ?? module), {
    name: 'decode-loaded-configuration',
  });
};
