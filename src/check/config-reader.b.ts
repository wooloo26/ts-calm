/**
 * @boundary Load and validate the project's synchronous configuration; reject invalid options explicitly.
 * @effects node:fs
 * @effects node:module
 * @allow strict-fp/no-assertion -- Cast only after validating every supported configuration field.
 * @allow strict-fp/no-throw -- Invalid configuration is an operational failure handled by the CLI.
 * @allow strict-fp/no-delete -- Reload the selected config instead of retaining a stale require cache entry.
 * @allow strict-fp/no-try -- Always remove this invocation's temporary synchronous module resolver hook.
 */
import { existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { join } from 'node:path';
import { strictChecks } from '#check/types';
import type { CheckConfig } from '#check/types';
import { isArray, isPlainObject } from '#fp/guards';
import { compilerConditions } from '#check/compiler-options.b';

const object = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value))
    throw new Error('Configuration must contain objects, not null or arrays.');
  return value;
};
const keys = (value: Record<string, unknown>, allowed: readonly string[]): void => {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
};
const strings = (value: unknown, key: string): void => {
  if (!isArray(value) || !value.every((item) => typeof item === 'string' && item.length > 0))
    throw new Error(`${key} must be an array of nonempty strings.`);
};
const ruleNames = [
  'commit-message',
  'function-length',
  'boundary',
  'no-file-cycles',
  'no-module-cycles',
  'strict-fp',
  'purity',
];

const validateRuleOptions = (name: string, value: unknown): void => {
  if (typeof value === 'boolean') return;
  if (['boundary', 'no-file-cycles', 'no-module-cycles', 'purity'].includes(name))
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
      if (typeof option !== 'boolean') throw new Error(`${key} must be a boolean.`);
    } else if (typeof option !== 'number' || !Number.isSafeInteger(option) || option < 1)
      throw new Error(`${key} must be a positive integer.`);
  }
  if (
    name === 'function-length' &&
    Number(options['warning'] ?? 80) > Number(options['maximum'] ?? 150)
  )
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
    if (!Array.isArray(config['overrides'])) throw new Error('overrides must be an array.');
    for (const item of config['overrides']) {
      const override = object(item);
      keys(override, ['files', 'rules']);
      strings(override['files'], 'overrides.files');
      const rules = object(override['rules']);
      keys(rules, ruleNames);
      for (const [name, enabled] of Object.entries(rules)) {
        if (name === 'no-file-cycles' || name === 'no-module-cycles' || name === 'commit-message')
          throw new Error(`${name} is project-wide; configure it at rules, not overrides.`);
        if (typeof enabled !== 'boolean') throw new Error('Override rules must be booleans.');
      }
    }
  }
  return config as CheckConfig;
};

/** @impure Read and execute trusted project configuration. */
export const loadConfiguration = (root: string): CheckConfig => {
  const path = join(root, 'ts-calm.config.ts');
  if (!existsSync(path)) return {};
  const load = createRequire(import.meta.url);
  delete load.cache[path];
  const conditions = compilerConditions(root, 'ts-calm.config.ts', new Map());
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return next(specifier, { ...context, conditions: [...context.conditions, ...conditions] });
    },
  });
  try {
    const loaded: unknown = load(path);
    const module = object(loaded);
    return validateConfiguration(module['default'] ?? module);
  } finally {
    hooks.deregister();
  }
};
