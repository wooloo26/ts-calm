/**
 * @boundary Load and validate the project's synchronous configuration; reject invalid options explicitly.
 * @effects node:fs
 * @effects node:module
 */
import { existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { strictChecks } from '#src/core/types';
import type { CheckConfig } from '#src/core/types';
import { isArray, isPlainObject } from '@ts-calm/fp';
import { compilerConditions } from '#src/compiler-options.b';

const object = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value))
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    throw new Error('Configuration must contain objects, not null or arrays.');
  return value;
};
const keys = (value: Record<string, unknown>, allowed: readonly string[]): void => {
  for (const key of Object.keys(value))
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    if (!allowed.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
};
const strings = (value: unknown, key: string): void => {
  if (!isArray(value) || !value.every((item) => typeof item === 'string' && item.length > 0))
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    throw new Error(`${key} must be an array of nonempty strings.`);
};
const ruleNames = [
  'commit-message',
  'function-length',
  'function-params',
  'boundary',
  'no-file-cycles',
  'no-module-cycles',
  'strict-fp',
  'purity',
];

const validateRuleOptions = (name: string, value: unknown): void => {
  if (typeof value === 'boolean') return;
  if (
    ['boundary', 'function-params', 'no-file-cycles', 'no-module-cycles', 'purity'].includes(name)
  )
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    throw new Error(`${name} must be a boolean.`);
  const options = object(value);
  const allowed =
    name === 'strict-fp'
      ? strictChecks
      : name === 'function-length'
        ? ['warning', 'maximum']
        : ['scopes', 'maxLength', 'ascii'];
  keys(options, allowed);
  for (const [key, option] of Object.entries(options)) {
    if (key === 'scopes') strings(option, key);
    else if (key === 'ascii' || name === 'strict-fp') {
      // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
      if (typeof option !== 'boolean') throw new Error(`${key} must be a boolean.`);
    } else if (typeof option !== 'number' || !Number.isSafeInteger(option) || option < 1)
      // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
      throw new Error(`${key} must be a positive integer.`);
  }
  if (
    name === 'function-length' &&
    Number(options['warning'] ?? 80) > Number(options['maximum'] ?? 150)
  )
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    throw new Error('function-length warning must not exceed maximum.');
};

export const validateConfiguration = (value: unknown): CheckConfig => {
  const config = object(value);
  keys(config, ['files', 'ignores', 'effectImports', 'rules', 'overrides']);
  for (const key of ['files', 'ignores', 'effectImports'])
    if (key in config) strings(config[key], key);
  if ('rules' in config) {
    const rules = object(config['rules']);
    keys(rules, ruleNames);
    for (const [name, options] of Object.entries(rules)) validateRuleOptions(name, options);
  }
  if ('overrides' in config) {
    // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
    if (!Array.isArray(config['overrides'])) throw new Error('overrides must be an array.');
    for (const item of config['overrides']) {
      const override = object(item);
      keys(override, ['files', 'rules']);
      strings(override['files'], 'overrides.files');
      const rules = object(override['rules']);
      keys(rules, ruleNames);
      for (const [name, enabled] of Object.entries(rules)) {
        if (name === 'no-file-cycles' || name === 'no-module-cycles' || name === 'commit-message')
          // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
          throw new Error(`${name} is project-wide; configure it at rules, not overrides.`);
        // @allow strict-fp/no-throw -- Preserve the public boundary API exception contract; returning Result here would change callers.
        if (typeof enabled !== 'boolean') throw new Error('Override rules must be booleans.');
      }
    }
  }
  // @allow strict-fp/no-assertion -- Cast only after validating every supported configuration field.
  return config as CheckConfig;
};

/** @impure Walk this directory and its ancestors looking for the project configuration. */
const configurationPath = (root: string): string => {
  let directory = resolve(root),
    found = '';
  while (!found) {
    const candidate = join(directory, 'ts-calm.config.ts');
    if (existsSync(candidate)) found = candidate;
    else {
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return found;
};

/**
 * Load the configuration module with the custom conditions its own `tsconfig.json` declares.
 *
 * @impure Reads the filesystem and executes the selected module.
 * @param path - Absolute path of the module to execute.
 * @returns The loaded module namespace; the caller narrows it.
 */
const loadModule = (path: string): unknown => {
  const load = createRequire(import.meta.url);
  // @allow strict-fp/no-delete -- Reload the selected config instead of retaining a stale require cache entry.
  delete load.cache[path];
  const conditions = compilerConditions(dirname(path), path, new Map());
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return next(specifier, { ...context, conditions: [...context.conditions, ...conditions] });
    },
  });
  // @allow strict-fp/no-try -- Preserve unconditional cleanup and exception precedence required by this boundary API.
  try {
    return load(path);
  } finally {
    hooks.deregister();
  }
};

/** @impure Read and execute trusted project configuration. */
export const loadConfiguration = (root: string): CheckConfig => {
  const path = configurationPath(root);
  if (!path) return {};
  const module = object(loadModule(path));
  return validateConfiguration(module['default'] ?? module);
};
