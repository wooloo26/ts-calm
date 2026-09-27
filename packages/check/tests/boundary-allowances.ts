import { describe, expect, it } from 'vitest';
import { runChecks } from '@ts-calm/check';
import type { CheckConfig } from '@ts-calm/check';

const header = '/** @boundary Preserve the external protocol. */\n';
const allow = '// @allow strict-fp/no-null -- Protocol requires null.\n';
const lint = (body: string, options: { path?: string; config?: CheckConfig } = {}) =>
  runChecks(
    { files: [{ path: options.path ?? 'src/adapter.b.ts', content: header + body }] },
    options.config,
  );
const rules = (body: string, options: { path?: string; config?: CheckConfig } = {}) =>
  lint(body, options).map((issue) => issue.rule);

describe('line allowances', () => {
  it.each(['\n', '\r\n'])('only covers the exact following line with %j endings', (ending) => {
    const issues = lint(
      (allow + 'export const first=()=>null;\nexport const second=()=>null;').replaceAll(
        '\n',
        ending,
      ),
    );
    expect(issues.map((issue) => [issue.rule, issue.line, issue.column])).toEqual([
      ['strict-fp/no-null', 4, 25],
    ]);
  });
  it('covers repeated occurrences on its line with a normal trailing comment', () => {
    expect(lint(allow + 'export const first=()=>[null,null]; // protocol values')).toEqual([]);
  });
  it('groups contiguous directives with individual reasons', () => {
    expect(
      lint(
        allow +
          '// @allow strict-fp/no-any -- Vendor callback signature.\nexport const f=(x:any)=>x ?? null;',
      ),
    ).toEqual([]);
  });
  it('does not cover another rule or a nested function', () => {
    expect(rules(allow + 'export const f=(x:any)=>x ?? null;')).toEqual(['strict-fp/no-any']);
    expect(rules(allow + 'export const f=()=>{\nreturn ()=>null;\n};')).toEqual(
      expect.arrayContaining(['boundary/unused', 'strict-fp/no-null']),
    );
  });
  it('matches the diagnostic line of a multiline expression', () => {
    expect(lint('export const f=()=>\n' + allow + '  null;')).toEqual([]);
    expect(rules(allow + 'export const f=()=>\n  null;')).toContain('strict-fp/no-null');
  });
  it.each(['src/a.ts', 'src/a.b.tsx', 'src/a.b.mts', 'src/a.b.cts'])(
    'rejects allowances in %s',
    (path) => {
      expect(rules(allow + 'export const f=()=>null;', { path })).toEqual(
        expect.arrayContaining(['boundary/suffix', 'strict-fp/no-null']),
      );
      expect(
        rules(allow + 'export const f=()=>null;', { path, config: { rules: { boundary: false } } }),
      ).toEqual(['strict-fp/no-null']);
    },
  );
  it.each([
    '/** @allow strict-fp/no-null -- Protocol. */\n',
    '/* @allow strict-fp/no-null -- Protocol. */\n',
    '// @allow strict-fp/* -- Protocol.\n',
    '// @allow no-file-cycles -- Protocol.\n',
    '// @allow function-length -- Protocol.\n',
    '// @allow strict-fp/no-null\n',
    '// @allow strict-fp/no-null --   \n',
    '// @allow\n',
    'const before=1; // @allow strict-fp/no-null -- Protocol.\n',
  ])('rejects invalid directive %j', (directive) => {
    expect(rules(directive + 'export const f=()=>null;')).toEqual(
      expect.arrayContaining(['boundary/allow', 'strict-fp/no-null']),
    );
  });
  it('rejects old file-header allowances', () => {
    const content =
      '/**\n * @boundary External protocol.\n * @allow strict-fp/no-null -- protocol\n */\nexport const f=()=>null;';
    expect(runChecks({ files: [{ path: 'a.b.ts', content }] }).map((issue) => issue.rule)).toEqual(
      expect.arrayContaining(['boundary/allow', 'strict-fp/no-null']),
    );
  });
  it('rejects a trailing allowance on the violation itself', () => {
    expect(rules('export const f=()=>null; ' + allow)).toEqual(
      expect.arrayContaining(['boundary/allow', 'strict-fp/no-null']),
    );
  });
  it.each(['\n', '// ordinary comment\n', '/* comment */\n', '// @allow unknown -- reason\n'])(
    'does not jump across %j',
    (gap) => {
      expect(rules(allow + gap + 'export const f=()=>null;')).toEqual(
        expect.arrayContaining(['boundary/allow', 'strict-fp/no-null']),
      );
    },
  );
  it('rejects dangling directives', () => {
    for (const directive of [allow, allow.trimEnd()])
      expect(rules(directive)).toContain('boundary/allow');
  });
  it('reports duplicates while retaining the first valid allowance', () => {
    expect(rules(allow + allow + 'export const f=()=>null;')).toEqual(['boundary/duplicate']);
  });
  it('reports stale directives without inventing a boundary purpose', () => {
    expect(rules(allow + 'export const f=()=>1;')).toEqual(
      expect.arrayContaining(['boundary/unused', 'boundary/purpose']),
    );
  });
  it('validates allowances even when the target rule is disabled', () => {
    const config = { rules: { 'strict-fp': false } } as const;
    expect(lint(allow + 'export const f=()=>null;', { config })).toEqual([]);
    expect(rules(allow + 'export const f=()=>1;', { config })).toContain('boundary/unused');
  });
  it('retains allowances alongside boundary errors or with boundary disabled', () => {
    const code = allow + 'export const f=()=>[null,Date.now()];';
    expect(rules(code)).toContain('boundary/undeclared');
    expect(rules(code)).not.toContain('strict-fp/no-null');
    expect(rules(code, { config: { rules: { boundary: false } } })).not.toContain(
      'strict-fp/no-null',
    );
  });
  it('does not treat a string or template as a directive', () => {
    expect(
      rules('const comment="// @allow strict-fp/no-null -- pretend";\nexport const f=()=>null;'),
    ).toEqual(expect.arrayContaining(['boundary/purpose', 'strict-fp/no-null']));
    expect(
      rules('const comment=`// @allow strict-fp/no-null -- pretend`;\nexport const f=()=>null;'),
    ).not.toContain('boundary/allow');
  });
  it('accepts a fixed callback but still requires a boundary implementation', () => {
    const directive = '// @allow function-params -- Fixed vendor callback.\n';
    expect(
      lint(directive + 'export const f=(a:unknown,b:unknown,c:unknown,d:unknown)=>[a,b,c,d];'),
    ).toEqual([]);
    expect(
      rules(directive + 'export type F=(a:unknown,b:unknown,c:unknown,d:unknown)=>unknown;'),
    ).toContain('boundary/purpose');
  });
  it('allows an initial directive only as an actual next-line allowance', () => {
    const content = allow + 'export const f=()=>null;';
    expect(runChecks({ files: [{ path: 'a.b.ts', content }] }).map((issue) => issue.rule)).toEqual([
      'boundary/reason',
    ]);
  });
});
