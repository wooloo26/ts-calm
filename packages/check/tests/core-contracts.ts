import { describe, expect, it } from 'vitest';
import { analyzeSources, runChecks, validateConfiguration } from '@ts-calm/check';
import { matches, selected, enabled } from '#src/core/configuration';
import { diagnostic, formatDiagnostics, byPosition } from '#src/core/diagnostics';
import { maskedSource, effectiveLineCount, parseAllowance } from '#src/rules/function-length/lines';
import { classifyTarget } from '#src/resolution';
import { resolve } from 'node:path';

describe('configuration and diagnostics', () => {
  it.each([
    ['src/a.ts', '**/*.ts', true],
    ['a.ts', '**/*.ts', true],
    ['src/a.ts', 'src/?.ts', true],
    ['src/ab.ts', 'src/?.ts', false],
    ['src/x/a.ts', 'src/*.ts', false],
    ['src/a+b.ts', 'src/a+b.ts', true],
    ['src/a.b.ts', 'src/a.b.ts', true],
    ['src\\a.ts', 'src/*.ts', true],
    ['deep/a.ts', '**', true],
  ])('matches %s against %s', (path, pattern, expected) =>
    expect(matches(path, pattern)).toBe(expected),
  );
  it('applies includes, ignores and ordered overrides', () => {
    expect(selected('src/a.ts', { files: ['src/*.ts'], ignores: ['**/a.ts'] })).toBe(false);
    expect(selected('a.js', {})).toBe(false);
    expect(selected('lib/a.ts', { files: ['src/**'] })).toBe(false);
    expect(enabled('strict-fp', 'tests/a.ts', {})).toBe(false);
    expect(
      enabled('strict-fp', 'tests/a.ts', {
        overrides: [
          { files: ['src/**'], rules: { 'strict-fp': true } },
          { files: ['tests/**'], rules: { 'strict-fp': true } },
        ],
      }),
    ).toBe(true);
    expect(
      enabled('function-params', 'a.ts', {
        overrides: [{ files: ['**'], rules: { boundary: false } }],
      }),
    ).toBe(true);
  });
  it.each([
    null,
    [],
    { files: [''] },
    { ignores: 3 },
    { effectImports: [4] },
    { unknown: true },
    { rules: { unknown: true } },
    { rules: { boundary: {} } },
    { rules: { 'strict-fp': { 'no-any': 1 } } },
    { rules: { 'commit-message': { ascii: 2 } } },
    { rules: { 'commit-message': { maxLength: 0 } } },
    { rules: { 'function-length': { warning: 90, maximum: 80 } } },
    { overrides: {} },
    { overrides: [{ files: ['**'], rules: { 'no-file-cycles': false } }] },
  ])('rejects invalid configuration %j', (value) =>
    expect(() => validateConfiguration(value)).toThrow(),
  );
  it('accepts all supported option families', () => {
    const config = {
      files: ['**/*.ts'],
      ignores: [],
      effectImports: ['vendor'],
      rules: {
        'strict-fp': { 'no-any': false },
        'function-length': { warning: 4, maximum: 8 },
        'function-params': false,
        'commit-message': { scopes: ['check'], ascii: false, maxLength: 70 },
      },
    };
    expect(validateConfiguration(config)).toEqual(config);
  });
  it('formats positions, severity and multiline help deterministically', () => {
    const source = { path: 'a.ts', content: 'first\nsecond' };
    const issue = diagnostic(source, 'example', {
      message: 'Fix this.',
      offset: 7,
      severity: 'warning',
    });
    expect(issue).toMatchObject({ line: 2, column: 2, severity: 'warning' });
    expect(formatDiagnostics([{ ...issue, help: 'one\ntwo' }])).toBe(
      'a.ts:2:2 warning example: Fix this.\n  one\n  two',
    );
    expect(formatDiagnostics([])).toBe('');
    expect(
      [
        issue,
        diagnostic(source, 'a', { message: 'x' }),
        { ...issue, rule: 'z' },
        { ...issue, file: 'b.ts' },
        { ...issue, column: 3 },
      ]
        .toSorted(byPosition)
        .map((v) => [v.file, v.line, v.column, v.rule]),
    ).toEqual([
      ['a.ts', 1, 1, 'a'],
      ['a.ts', 2, 2, 'example'],
      ['a.ts', 2, 2, 'z'],
      ['a.ts', 2, 3, 'example'],
      ['b.ts', 2, 2, 'example'],
    ]);
  });
  it('classifies unsupported, excluded and external import targets', () => {
    const root = resolve('fixture-root');
    const owned = new Set(['a.ts']);
    expect(
      classifyTarget(root, owned, { specifier: './a', resolved: resolve(root, 'a.ts') }),
    ).toEqual({ kind: 'project', path: 'a.ts' });
    expect(
      classifyTarget(root, owned, {
        specifier: 'vendor',
        resolved: resolve(root, '../external/a.ts'),
        packageTarget: true,
      }),
    ).toEqual({ kind: 'external' });
    expect(
      classifyTarget(root, owned, {
        specifier: './excluded',
        resolved: resolve(root, 'excluded.ts'),
      }),
    ).toMatchObject({ kind: 'error', message: expect.stringContaining('excluded') });
    expect(
      classifyTarget(root, owned, {
        specifier: '#outside',
        resolved: resolve(root, '../other/data.json'),
      }),
    ).toMatchObject({ kind: 'error' });
    expect(
      classifyTarget(root, owned, { specifier: 'asset', resolved: resolve(root, 'data.json') }),
    ).toEqual({ kind: 'external' });
  });
});

describe('function length counting', () => {
  it('masks unsorted or overlapping comments without changing offsets', () => {
    const source = 'a/* x\ny */b// z\nc';
    const comments = [
      { text: 'z', start: 11, end: 15 },
      { text: 'x', start: 1, end: 10 },
      { text: 'overlap', start: 2, end: 5 },
    ];
    const masked = maskedSource(source, comments);
    expect(masked).toHaveLength(source.length);
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
    expect(masked).not.toContain('x');
  });
  it('excludes nested function bodies at multiple levels while retaining outer statements', () => {
    const content =
      'function outer(){\nconst child=()=>{\nconst inner=()=>{\nreturn 1;\n};\nreturn inner();\n};\nreturn child();\n}\nconst expression=()=>1;';
    const parsed = analyzeSources({ files: [{ path: 'a.ts', content }] })[0]?.parsed;
    expect(parsed).toBeDefined();
    if (!parsed) return;
    const counts = parsed.functions.map((fact) =>
      effectiveLineCount(content, fact, parsed.functions),
    );
    expect(counts).toEqual([3, 3, 1, 1]);
  });
  it('normalizes multiline function-length reasons and rejects unrelated text', () => {
    const comment = {
      text: '*\n * calm-allow-next-function function-length -- Required format\n * with a second line.\n ',
      start: 0,
      end: 100,
    };
    expect(parseAllowance(comment)).toMatchObject({
      target: 'function-length',
      reason: 'Required format\nwith a second line.',
    });
    expect(
      parseAllowance({ ...comment, text: 'unrelated calm-allow-next-function' }),
    ).toMatchObject({ target: '', reason: '' });
  });
  it('checks annotations for invalid reasons, duplicate coverage and orphan declarations', () => {
    const content =
      '// calm-allow-next-function function-length -- first\n// calm-allow-next-function function-length -- second\nfunction f(){\na();\nb();\n}\n// calm-allow-next-function function-length -- orphan';
    const issues = runChecks(
      { files: [{ path: 'a.ts', content }] },
      { rules: { 'function-length': { warning: 1, maximum: 2 } } },
    );
    expect(issues.map((issue) => issue.rule)).toEqual(
      expect.arrayContaining(['function-length/allow-duplicate', 'function-length/allow-orphan']),
    );
  });
});
