import { err, get, isArray, isErr, isPlainObject, mapError, ok, traverse } from '@ts-calm/fp';
import { captureResult } from '@ts-calm/fp/boundary';
import type { Decoder, Result } from '@ts-calm/fp';
import { issue } from '#src/core/issues';
import type { CheckIssue } from '#src/core/issues';
import { strictChecks } from '#src/core/types';
import type { CheckConfig, RuleName, StrictCheck } from '#src/core/types';

type ObjectValue = Readonly<Record<string, unknown>>;
type Rules = NonNullable<CheckConfig['rules']>;
type Override = NonNullable<CheckConfig['overrides']>[number];
export const ruleNames = [
  'commit-message',
  'function-length',
  'function-params',
  'boundary',
  'no-file-cycles',
  'no-module-cycles',
  'strict-fp',
  'purity',
] as const satisfies readonly RuleName[];
const invalid = (message: string): Result<never, CheckIssue> =>
  err(issue('invalid-config', 'validate-configuration', message));
const object: Decoder<ObjectValue, CheckIssue> = (value) =>
  isPlainObject(value)
    ? ok(value)
    : invalid('Configuration must contain objects, not null or arrays.');

const keys = (value: ObjectValue, allowed: readonly string[]): Result<ObjectValue, CheckIssue> => {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) return invalid(`Unknown configuration option: ${key}`);
  return ok(value);
};
const strings = (value: unknown, key: string): Result<readonly string[], CheckIssue> =>
  isArray(value)
    ? traverse(value, (item) =>
        typeof item === 'string' && item.length > 0
          ? ok(item)
          : invalid(`${key} must be an array of nonempty strings.`),
      )
    : invalid(`${key} must be an array of nonempty strings.`);
const options = (value: unknown, allowed: readonly string[]): Result<ObjectValue, CheckIssue> => {
  const decoded = object(value);
  return isErr(decoded) ? decoded : keys(get(decoded), allowed);
};
const positive = (value: unknown, key: string): Result<number, CheckIssue> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? ok(value)
    : invalid(`${key} must be a positive integer.`);

const lengthOptions: Decoder<Exclude<Rules['function-length'], boolean | void>, CheckIssue> = (
  value,
) => {
  const decoded = options(value, ['warning', 'maximum']);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  let output: Readonly<{ warning?: number; maximum?: number }> = {};
  for (const key of ['warning', 'maximum'] as const)
    if (key in source) {
      const number = positive(source[key], key);
      if (isErr(number)) return number;
      output = { ...output, [key]: get(number) };
    }
  return (output.warning ?? 80) > (output.maximum ?? 150)
    ? invalid('function-length warning must not exceed maximum.')
    : ok(output);
};
const commitOptions: Decoder<Exclude<Rules['commit-message'], boolean | void>, CheckIssue> = (
  value,
) => {
  const decoded = options(value, ['scopes', 'maxLength', 'ascii']);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  let output: Readonly<{ scopes?: readonly string[]; maxLength?: number; ascii?: boolean }> = {};
  if ('scopes' in source) {
    const names = strings(source['scopes'], 'scopes');
    if (isErr(names)) return names;
    output = { ...output, scopes: get(names) };
  }
  if ('maxLength' in source) {
    const length = positive(source['maxLength'], 'maxLength');
    if (isErr(length)) return length;
    output = { ...output, maxLength: get(length) };
  }
  if ('ascii' in source) {
    const ascii = source['ascii'];
    if (typeof ascii !== 'boolean') return invalid('ascii must be a boolean.');
    output = { ...output, ascii };
  }
  return ok(output);
};
const strictOptions: Decoder<Readonly<Partial<Record<StrictCheck, boolean>>>, CheckIssue> = (
  value,
) => {
  const decoded = options(value, strictChecks);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  let output: Partial<Record<StrictCheck, boolean>> = {};
  for (const name of strictChecks)
    if (name in source) {
      const active = source[name];
      if (typeof active !== 'boolean') return invalid(`${name} must be a boolean.`);
      output = { ...output, [name]: active };
    }
  return ok(output);
};
const decodeRules: Decoder<Rules, CheckIssue> = (value) => {
  const decoded = options(value, ruleNames);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  let output: Rules = {};
  for (const name of ruleNames)
    if (name in source) {
      const setting = source[name];
      if (typeof setting === 'boolean') output = { ...output, [name]: setting };
      else if (name === 'function-length') {
        const result = lengthOptions(setting);
        if (isErr(result)) return result;
        output = { ...output, [name]: get(result) };
      } else if (name === 'commit-message') {
        const result = commitOptions(setting);
        if (isErr(result)) return result;
        output = { ...output, [name]: get(result) };
      } else if (name === 'strict-fp') {
        const result = strictOptions(setting);
        if (isErr(result)) return result;
        output = { ...output, [name]: get(result) };
      } else return invalid(`${name} must be a boolean.`);
    }
  return ok(output);
};
const decodeOverride: Decoder<Override, CheckIssue> = (value) => {
  const decoded = options(value, ['files', 'rules']);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  const files = strings(source['files'], 'overrides.files');
  if (isErr(files)) return files;
  const decodedRules = options(source['rules'], ruleNames);
  if (isErr(decodedRules)) return decodedRules;
  let rules: Override['rules'] = {};
  const input = get(decodedRules);
  for (const name of ruleNames)
    if (name in input) {
      if (name === 'commit-message' || name === 'no-file-cycles' || name === 'no-module-cycles')
        return invalid(`${name} is project-wide; configure it at rules, not overrides.`);
      const active = input[name];
      if (typeof active !== 'boolean') return invalid('Override rules must be booleans.');
      rules = { ...rules, [name]: active };
    }
  return ok({ files: get(files), rules });
};

/** Decode a fresh configuration value, without retaining unchecked fields or throwing. */
const decodeConfiguration: Decoder<CheckConfig, CheckIssue> = (value) => {
  const decoded = options(value, ['files', 'ignores', 'effectImports', 'rules', 'overrides']);
  if (isErr(decoded)) return decoded;
  const source = get(decoded);
  let output: CheckConfig = {};
  for (const key of ['files', 'ignores', 'effectImports'] as const)
    if (key in source) {
      const items = strings(source[key], key);
      if (isErr(items)) return items;
      output = { ...output, [key]: get(items) };
    }
  if ('rules' in source) {
    const rules = decodeRules(source['rules']);
    if (isErr(rules)) return rules;
    output = { ...output, rules: get(rules) };
  }
  if ('overrides' in source) {
    const input = source['overrides'];
    if (!isArray(input)) return invalid('overrides must be an array.');
    const overrides = traverse(input, decodeOverride);
    if (isErr(overrides)) return overrides;
    output = { ...output, overrides: get(overrides) };
  }
  return ok(output);
};

/** Decode external values, including accessors or proxies that can fail during inspection. */
export const validateConfiguration: Decoder<CheckConfig, CheckIssue> = (value) =>
  mapError(
    captureResult(() => decodeConfiguration(value), { name: 'validate-configuration' }),
    (problem) =>
      problem.code === 'unexpected-fault'
        ? issue('invalid-config', 'validate-configuration', problem.message)
        : problem,
  );
