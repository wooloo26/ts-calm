import { expect, it } from 'vitest';
import { analyzeSources, runChecks } from '@ts-calm/check';
import { assert, boolean, constantFrom, property } from 'fast-check';
import { posix } from 'node:path';

const inspect = (body: string) => {
  const files = [
    {
      path: 'src/example.ts',
      content: `import * as fp from '@ts-calm/fp';
/** @impure Read host time. */ const clock=()=>Date.now();
/** @impure Mutate shared input. */ const append=(value:number[])=>value.push(1);
${body}`,
    },
  ];
  const config = { rules: { boundary: false, 'strict-fp': false } } as const;
  const imports = analyzeSources({ files }, config).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: file.source.path,
      imported,
      target: { kind: 'external' as const },
    })),
  );
  return runChecks({ files, imports }, config);
};
it.each([
  'const stored=fp.some(clock); export const run=()=>fp.match(stored,{some:f=>f(),none:()=>0});',
  'const stored=fp.ok(clock); const alias=stored; export const run=()=>fp.match(alias,{ok:f=>f(),err:()=>0});',
  'export const run=()=>fp.match(fp.fromResultData({status:"ok",value:clock}),{ok:f=>f(),err:()=>0});',
  'export const run=()=>fp.get(fp.get(fp.transpose(fp.some(fp.ok(clock)))))();',
  '/** @impure Read time on decode. */ const decode=()=>fp.ok(clock()); const decoder=fp.branded("clock",decode); const {parse}=decoder; export const run=()=>parse(1);',
  'const selected=flag?fp.some(clock):fp.none(); export const run=()=>fp.match(selected,{some:f=>f(),none:()=>0});',
  'const source={0:fp.some(clock)};const selected=source[0];export const run=()=>fp.match(selected,{some:f=>f(),none:()=>0});',
  'const source=[fp.some(clock)];const selected=source[0];export const run=()=>fp.match(selected,{some:f=>f(),none:()=>0});',
  'const held=fp.some(clock) satisfies fp.Option<()=>number>; export const run=()=>fp.match(held,{some:f=>f(),none:()=>0});',
  'export const run=()=>fp.match(fp.some(clock) satisfies fp.Option<()=>number>,{some:f=>f(),none:()=>0});',
])('preserves effects after a value-preserving rewrite: %s', (body) => {
  expect(
    inspect(body).some(
      (issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run'),
    ),
  ).toBe(true);
});
it('retains ownership of arrays captured in module containers', () => {
  expect(
    inspect(
      'const stored=fp.some([]); export const run=()=>fp.match(stored,{some:append,none:()=>0});',
    ).some((issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run')),
  ).toBe(true);
  expect(inspect('export const run=()=>fp.match(fp.some([]),{some:append,none:()=>0});')).toEqual(
    [],
  );
});
it('reports unknown fp calls as incomplete instead of silently discarding their contract', () => {
  const issues = inspect('export const run=()=>fp.futureHelper(clock);');
  expect(issues).toContainEqual(
    expect.objectContaining({
      rule: 'purity/incomplete',
      severity: 'warning',
      message: expect.stringContaining('futureHelper'),
    }),
  );
});

it('keeps diagnostics equivalent under data-only rewrites', () => {
  assert(
    property(
      boolean(),
      constantFrom('option', 'result'),
      constantFrom('inline', 'local', 'module', 'alias', 'dto', 'transpose', 'destructure'),
      (impure, family, rewrite) => {
        const ctor = family === 'option' ? 'some' : 'ok';
        const cases = family === 'option' ? '{some:f=>f(),none:()=>0}' : '{ok:f=>f(),err:()=>0}';
        const prefix = `const selected=${impure ? 'clock' : '()=>1'};`;
        let value = `fp.${ctor}(selected)`;
        if (rewrite === 'dto')
          value =
            family === 'option'
              ? `fp.fromOptionData(fp.toOptionData(${value}))`
              : `fp.fromResultData(fp.toResultData(${value}))`;
        if (rewrite === 'transpose')
          value = `fp.get(fp.transpose(fp.transpose(fp.${family === 'option' ? 'ok' : 'some'}(${value}))))`;
        let body = `${prefix} export const run=()=>fp.match(${value},${cases});`;
        if (rewrite === 'local')
          body = `${prefix} export const run=()=>{const held=${value};return fp.match(held,${cases});};`;
        if (rewrite === 'module' || rewrite === 'alias' || rewrite === 'destructure') {
          const setup =
            rewrite === 'destructure'
              ? `const {${ctor}:pack,match:fold}=fp; const held=pack(selected);`
              : `const held=${value};`;
          body = `${prefix} ${setup} const alias=held; export const run=()=>${rewrite === 'destructure' ? 'fold' : 'fp.match'}(${rewrite === 'alias' ? 'alias' : 'held'},${cases});`;
        }
        const issues = inspect(body);
        expect(issues.filter((issue) => issue.rule === 'purity/incomplete')).toEqual([]);
        expect(
          issues.some(
            (issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run'),
          ),
        ).toBe(impure);
      },
    ),
    { numRuns: 100, seed: 20260927 },
  );
});

it.each(['export {stored as saved} from "./provider.ts";', 'export * from "./provider.ts";'])(
  'follows retained values through re-exports: %s',
  (barrel) => {
    const alias = barrel.includes(' as saved') ? 'saved' : 'stored';
    const files = [
      {
        path: 'src/provider.ts',
        content:
          'import {some as wrap} from "@ts-calm/fp"; /** @impure Read time. */ const clock=()=>Date.now(); export const stored=wrap(clock);',
      },
      { path: 'src/barrel.ts', content: barrel },
      {
        path: 'src/run.ts',
        content: `import {${alias} as selected} from './barrel.ts'; import {match as fold} from '@ts-calm/fp'; export const run=()=>fold(selected,{some:f=>f(),none:()=>0});`,
      },
    ];
    const imports = analyzeSources({ files }).flatMap((file) =>
      file.parsed.imports.map((imported) => ({
        file: file.source.path,
        imported,
        target: imported.specifier.startsWith('.')
          ? {
              kind: 'project' as const,
              path: posix.normalize(
                posix.join(posix.dirname(file.source.path), imported.specifier),
              ),
            }
          : { kind: 'external' as const },
      })),
    );
    const issues = runChecks(
      { files, imports },
      { rules: { boundary: false, 'strict-fp': false } },
    );
    expect(issues.filter((issue) => issue.rule === 'purity/incomplete')).toEqual([]);
    expect(issues).toContainEqual(
      expect.objectContaining({ rule: 'purity/impure', file: 'src/run.ts' }),
    );
  },
);

it('does not replay an effectful module initializer when reading its result', () => {
  const issues = inspect('const held=fp.map(fp.ok(1),clock); export const run=()=>held;');
  expect(
    issues.some(
      (issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run'),
    ),
  ).toBe(false);
  expect(issues).toContainEqual(
    expect.objectContaining({
      rule: 'purity/incomplete',
      message: expect.stringContaining('retained fp initializer'),
    }),
  );
});

it('preserves mutations through module aliases while keeping private allocations private', () => {
  expect(
    inspect(
      'const values=[]; const held=fp.some(values); export const run=()=>fp.match(held,{some:append,none:()=>0});',
    ).some((issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run')),
  ).toBe(true);
  expect(
    inspect(
      'export const run=()=>{const values=[];const held=fp.some(values);return fp.match(held,{some:append,none:()=>0});};',
    ),
  ).toEqual([]);
});

it('retains possible callbacks behind computed module properties', () => {
  const issues = inspect(
    'const key="held"; const values={[key]:fp.some(clock)}; const held=values[key]; export const run=()=>fp.match(held,{some:f=>f(),none:()=>0});',
  );
  expect(
    issues.some(
      (issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run'),
    ),
  ).toBe(true);
});
it('marks module accessors as unmodeled rather than invoking them as stored callbacks', () => {
  const issues = inspect(
    'const held={get value(){return clock}}; export const run=()=>held.value();',
  );
  expect(issues).toContainEqual(
    expect.objectContaining({
      rule: 'purity/incomplete',
      message: expect.stringContaining('Accessor in retained initializer'),
    }),
  );
});

it('reports opaque retained arguments without replaying a factory during reads', () => {
  const issues = inspect(
    '/** @impure Initialize once. */ const create=()=>{clock();return clock;}; const held=fp.some(create()); export const run=()=>fp.match(held,{some:f=>f(),none:()=>0});',
  );
  expect(
    issues.some(
      (issue) => issue.rule === 'purity/impure' && issue.message.includes('Function run'),
    ),
  ).toBe(false);
  expect(issues).toContainEqual(
    expect.objectContaining({
      rule: 'purity/incomplete',
      message: expect.stringContaining('Unmodeled argument in retained fp initializer'),
    }),
  );
});
