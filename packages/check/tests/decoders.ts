import { expect, it, expectTypeOf, vi } from 'vitest';
import { join, resolve } from 'node:path';
import { getError, isErr } from '@ts-calm/fp';
import type { AsyncResult, Result } from '@ts-calm/fp';
import {
  validateConfiguration,
  checkProject,
  typecheckProject,
  loadConfiguration,
  failureMessage,
} from '@ts-calm/check';
import type { CheckConfig, CheckIssue, CheckFailure, Diagnostic } from '@ts-calm/check';
import { compilerConditionsFromOutput, typeDiagnostics } from '#src/compiler';
import { snapshotEntries, indexEntries, decodeBlobs, dependencyTarget } from '#src/snapshot';
import { decodeManifest, planInitialization } from '#src/manifest';
import { parseCommand } from '#src/cli';
import { success, failureText } from '#tests/fixtures/result';

it('exposes Result contracts and constructs owned configuration values', () => {
  const input = {
    files: ['src/*.ts'],
    rules: { 'strict-fp': { 'no-null': false } },
    overrides: [{ files: ['test/**'], rules: { purity: false } }],
  };
  const decoded = validateConfiguration(input);
  expectTypeOf(decoded).toEqualTypeOf<Result<CheckConfig, CheckIssue>>();
  expectTypeOf(checkProject).returns.toEqualTypeOf<
    AsyncResult<readonly Diagnostic[], CheckFailure>
  >();
  expectTypeOf(typecheckProject).returns.toEqualTypeOf<
    Result<readonly Diagnostic[], CheckFailure>
  >();
  expectTypeOf(loadConfiguration).returns.toEqualTypeOf<Result<CheckConfig, CheckFailure>>();
  expectTypeOf(decoded).not.toExtend<CheckConfig>();
  expectTypeOf<ReturnType<typeof typecheckProject>>().not.toExtend<readonly Diagnostic[]>();
  const value = success(decoded);
  input.files.push('later.ts');
  input.rules['strict-fp']['no-null'] = true;
  expect(value.files).toEqual(['src/*.ts']);
  expect(value.rules?.['strict-fp']).toEqual({ 'no-null': false });
});
it.each([
  {
    rules: {
      'commit-message': { scopes: ['check'], maxLength: 88, ascii: false },
      'function-length': { maximum: 100 },
      'strict-fp': { 'no-any': true },
    },
  },
  { rules: { 'function-length': { warning: 50 } } },
  { overrides: [{ files: ['**'], rules: { 'function-params': false } }] },
])('round-trips supported configuration %j', (input) =>
  expect(success(validateConfiguration(input))).toEqual(input),
);
it.each([
  { rules: { 'commit-message': { scopes: 3 } } },
  { rules: { 'commit-message': { maxLength: 1.5 } } },
  { rules: { 'function-length': { maximum: '100' } } },
  { rules: { 'strict-fp': null } },
  { overrides: [{ files: [], rules: { unknown: true } }] },
  { overrides: [{ files: 4, rules: {} }] },
  { overrides: [{ files: [], rules: { 'commit-message': true } }] },
])('returns invalid-config instead of throwing for %j', (input) => {
  const result = validateConfiguration(input);
  expect(isErr(result)).toBe(true);
  if (isErr(result))
    expect(getError(result)).toMatchObject({
      code: 'invalid-config',
      operation: 'validate-configuration',
    });
});
it('decodes manifests and computes initialization without filesystem access', () => {
  const syntax = decodeManifest('{');
  expect(isErr(syntax)).toBe(true);
  if (isErr(syntax)) expect(getError(syntax).code).toBe('invalid-manifest');
  expect(failureText(decodeManifest('[]'))).toContain('must contain an object');
  expect(isErr(decodeManifest('{'))).toBe(true);
  expect(success(planInitialization('')).result.created).toEqual(['package.json']);
  expect(success(planInitialization('{"name":"app"}')).content).toContain('"type": "module"');
  expect(success(planInitialization('{"type":"module"}')).content).toBe('');
  expect(success(planInitialization('{"type":"commonjs"}')).result.warnings).toHaveLength(1);
});
it('normalizes compiler output including global errors and continuation lines', () => {
  const result = typeDiagnostics(
    'noise\nfoo.ts(2,3): warning TS123: first\n  detail\nerror TS456: global\n',
    (file) => 'src/' + file,
  );
  expect(result).toEqual([
    {
      rule: 'typecheck/TS123',
      file: 'src/foo.ts',
      line: 2,
      column: 3,
      severity: 'warning',
      message: 'first\n  detail',
    },
    {
      rule: 'typecheck/TS456',
      file: 'tsconfig.json',
      line: 1,
      column: 1,
      severity: 'error',
      message: 'global',
    },
  ]);
  expect(typeDiagnostics('warning TS999: warning', (file) => file)[0]?.severity).toBe('warning');
  expect(success(compilerConditionsFromOutput('{}'))).toEqual([]);
  expect(
    success(compilerConditionsFromOutput('{"compilerOptions":{"customConditions":["dev",1]}}')),
  ).toEqual(['dev']);
  expect(isErr(compilerConditionsFromOutput('{'))).toBe(true);
});
it('validates staged entries and blob framing before writing files', () => {
  const root = resolve('snapshot');
  for (const path of ['../escape', '.git/config', 'node_modules/x', ''])
    expect(isErr(snapshotEntries(root, `100644 abc 0\t${path}\0`))).toBe(true);
  for (const index of ['bad\0', '100644 abc 1\tsrc/a.ts\0', '160000 abc 0\tsubmodule\0'])
    expect(isErr(indexEntries(index))).toBe(true);
  expect(success(snapshotEntries(root, '100755 abc 0\trun\0'))[0]?.destination).toBe(
    join(root, 'run'),
  );
  expect(
    success(decodeBlobs(Buffer.from('abc blob 3\na\nb\n'), ['abc']))
      .get('abc')
      ?.toString(),
  ).toBe('a\nb');
  for (const output of [
    '',
    'abc blob -1\n\n',
    'abc tree 1\nx\n',
    'wrong blob 1\nx\n',
    'abc blob 3\na\n',
    'abc blob 1\nx!',
  ])
    expect(isErr(decodeBlobs(Buffer.from(output), ['abc']))).toBe(true);
});
it('selects dependency origins inside the staged snapshot', () => {
  const repository = resolve('repo'),
    snapshot = resolve('snapshot');
  const context = {
    repository,
    snapshot,
    staged: new Set(['packages/lib']),
    packages: new Map([['lib', 'packages/lib']]),
  };
  expect(
    success(
      dependencyTarget(context, {
        name: 'lib',
        original: join(repository, 'packages/lib'),
        directory: '.',
      }),
    ).target,
  ).toBe(join(snapshot, 'packages/lib'));
  expect(
    isErr(
      dependencyTarget(
        { ...context, staged: new Set() },
        { name: 'lib', original: join(repository, 'packages/lib'), directory: '.' },
      ),
    ),
  ).toBe(true);
});
it('parses CLI requests without reading process state', () => {
  expect(
    success(parseCommand(['check', '--json', '--staged', '--cwd', 'app'], resolve('root'))),
  ).toMatchObject({ kind: 'check', json: true, staged: true, root: resolve('root/app') });
  expect(isErr(parseCommand(['unknown'], '.'))).toBe(true);
  expect(isErr(parseCommand(['commit-message'], '.'))).toBe(true);
  expect(success(parseCommand(['--version'], '.')).kind).toBe('version');
});
it('renders normalized unexpected errors without inspecting their causes', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  expect(
    failureMessage({
      code: 'unexpected-fault',
      operation: 'external',
      message: 'safe message',
      cause: revoked.proxy,
    }),
  ).toBe('safe message');
  expect(isErr(validateConfiguration(revoked.proxy))).toBe(true);
  expect(
    failureText(
      validateConfiguration({
        get files() {
          throw new Error('accessor failed');
        },
      }),
    ),
  ).toBe('accessor failed');
});

it('reads guarded configuration properties once before constructing their typed fields', () => {
  let asciiReads = 0,
    overrideReads = 0;
  const input = {
    rules: {
      'commit-message': {
        get ascii() {
          asciiReads += 1;
          return asciiReads === 1 ? true : 'wrong';
        },
      },
    },
    get overrides() {
      overrideReads += 1;
      return overrideReads === 1 ? [] : 'wrong';
    },
  };
  const decoded = success(validateConfiguration(input));
  expect(decoded.rules?.['commit-message']).toEqual({ ascii: true });
  expect(decoded.overrides).toEqual([]);
  expect([asciiReads, overrideReads]).toEqual([1, 1]);
});

it('preserves unexpected JSON parser failures as Faults', () => {
  const cause = new Error('parser malfunction');
  vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
    throw cause;
  });
  const result = decodeManifest('{}');
  expect(isErr(result)).toBe(true);
  if (isErr(result)) expect(getError(result)).toMatchObject({ code: 'unexpected-fault', cause });
});
it('normalizes a malformed SyntaxError message in a manifest issue', () => {
  const cause = Object.defineProperty(new SyntaxError(), 'message', { value: 42 });
  vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
    throw cause;
  });
  const result = decodeManifest('{}');
  expect(isErr(result)).toBe(true);
  if (isErr(result))
    expect(getError(result)).toMatchObject({
      code: 'invalid-manifest',
      message: 'package.json contains invalid JSON.',
    });
});
