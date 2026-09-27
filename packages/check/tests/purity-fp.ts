import { expect, it } from 'vitest';
import { analyzeSources, runChecks } from '@ts-calm/check';

const inspect = (body: string) => {
  const content = `import * as fp from '@ts-calm/fp'; import * as boundary from '@ts-calm/fp/boundary';
/** @impure Read host time. */ const clock=()=>Date.now();
/** @impure Modify the caller array. */ const append=(value:number[])=>{value.push(1);return value;};
${body}`;
  const files = [{ path: 'src/example.ts', content }];
  const config = { rules: { boundary: false, 'strict-fp': false } } as const;
  const imports = analyzeSources({ files }, config).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: file.source.path,
      imported,
      target: { kind: 'external' as const },
    })),
  );
  return runChecks({ files, imports }, config).filter((issue) => issue.rule === 'purity/impure');
};

it.each([
  'fp.match(fp.ok(1),{ok:clock,err:()=>0})',
  'fp.match(fp.some(1),{some:clock,none:()=>0})',
  'fp.completeWithCleanup(fp.err("main"),[fp.err("cleanup")],clock)',
  'boundary.capture(()=>1,{name:"read",classify:()=>fp.some(clock())})',
  'boundary.captureAsync(async()=>1,{name:"read",classify:()=>fp.some(clock())})',
  'fp.decodeJson("1",{decode:()=>fp.ok(clock()),encode:(value:number)=>value})',
  'fp.encodeJson(1,{decode:fp.ok,encode:clock})',
  'fp.branded("clock",()=>fp.ok(clock())).parse("input")',
])('propagates callback effects through %s', (expression) => {
  expect(
    inspect(`export const run=()=>${expression};`).some((issue) =>
      issue.message.includes('Function run'),
    ),
  ).toBe(true);
});
it.each([
  'fp.map(fp.ok(INPUT),append)',
  'fp.flatMap(fp.ok(INPUT),value=>fp.ok(append(value)))',
  'fp.match(fp.some(INPUT),{some:append,none:()=>[]})',
  'fp.getOrElse(fp.some(INPUT),()=>[])',
  'fp.branded("array",value=>fp.ok(append(value))).parse(INPUT)',
])('retains payload ownership through %s', (expression) => {
  const shared = expression.replaceAll('INPUT', 'input');
  const local = expression.replaceAll('INPUT', '[]');
  const unwrap = expression.startsWith('fp.getOrElse') ? 'append(VALUE)' : 'VALUE';
  expect(
    inspect(`export const run=(input:number[])=>${unwrap.replace('VALUE', shared)};`).some(
      (issue) => issue.message.includes('Function run'),
    ),
  ).toBe(true);
  expect(inspect(`export const run=()=>${unwrap.replace('VALUE', local)};`)).toEqual([]);
});
it('retains a deferred decoder without executing it during construction', () => {
  expect(
    inspect(
      '/** @impure Read host time. */ const decode=()=>fp.ok(clock()); export const build=()=>fp.branded("clock",decode);',
    ),
  ).toEqual([]);
  expect(
    inspect(
      'const decoder=fp.branded("clock",()=>fp.ok(clock())); export const run=()=>decoder.parse(1);',
    ).some((issue) => issue.message.includes('Function run')),
  ).toBe(true);
});
it('preserves callback identity across separate containers', () => {
  expect(
    inspect(
      'export const run=()=>{const safe=fp.some(()=>1); const effect=fp.some(clock); fp.match(safe,{some:fn=>fn(),none:()=>0}); return fp.match(effect,{some:fn=>fn(),none:()=>0});}',
    ).some((issue) => issue.message.includes('Function run')),
  ).toBe(true);
});

it.each([
  'fp.mapError(fp.err(1),clock)',
  'fp.inspect(fp.ok(1),clock)',
  'fp.inspectError(fp.err(1),clock)',
  'fp.orElse(fp.err(1),()=>fp.ok(clock()))',
  'fp.toResult(fp.none(),clock)',
  'fp.filter(fp.ok(1),()=>false,clock)',
  'fp.andThrough(fp.ok(1),()=>fp.ok(clock()))',
  'fp.findValue([1],clock)',
  'fp.traverse([1],()=>fp.ok(clock()))',
  'fp.traverseAsync([1],async()=>fp.ok(clock()))',
  'fp.filterMap([1],()=>fp.some(clock()))',
  'fp.findMap([1],()=>fp.some(clock()))',
  'fp.isUniqueBy([1],clock)',
  'boundary.captureResult(()=>fp.ok(clock()),{name:"read"})',
  'boundary.captureResultAsync(async()=>fp.ok(clock()),{name:"read"})',
])('covers the callback contract of %s', (expression) => {
  expect(
    inspect(`export const run=()=>${expression};`).some((value) =>
      value.message.includes('Function run'),
    ),
  ).toBe(true);
});
it.each([
  'fp.map(fp.err(1),clock)',
  'fp.map(fp.none(),clock)',
  'fp.mapError(fp.ok(1),clock)',
  'fp.inspectError(fp.some(1),clock)',
  'fp.getOrElse(fp.some(1),clock)',
  'fp.orElse(fp.some(1),clock)',
  'fp.toResult(fp.some(1),clock)',
])('does not invoke an unreachable callback in %s', (expression) => {
  expect(inspect(`export const run=()=>${expression};`)).toEqual([]);
});
it.each([
  'fp.get(fp.ok(INPUT))',
  'fp.getError(fp.err(INPUT))',
  'fp.getOrElse(fp.fromNullable(INPUT),()=>[])',
  'fp.getOrElse(fp.nonEmpty(INPUT),()=>[])',
  'fp.getOrElse(fp.at([INPUT],0),()=>[])',
  'fp.getOrElse(fp.lookup({key:INPUT},"key"),()=>[])',
  'fp.get(fp.flatten(fp.ok(fp.ok(INPUT))))',
])('retains ownership when unwrapping %s', (expression) => {
  expect(
    inspect(
      `export const run=(input:number[])=>append(${expression.replaceAll('INPUT', 'input')});`,
    ).some((value) => value.message.includes('Function run')),
  ).toBe(true);
  expect(inspect(`export const run=()=>append(${expression.replaceAll('INPUT', '[]')});`)).toEqual(
    [],
  );
});
it('retains payload shape for incoming typed Result and Option parameters', () => {
  expect(
    inspect(
      'export const run=(input:fp.Result<number[],string>)=>fp.map(input,values=>values.push(1));',
    ).some((value) => value.message.includes('Function run')),
  ).toBe(true);
  expect(
    inspect(
      'export const run=(input:fp.Option<number[]>)=>fp.match(input,{some:values=>values.push(1),none:()=>0});',
    ).some((value) => value.message.includes('Function run')),
  ).toBe(true);
});
it('keeps privately allocated aggregate results private', () => {
  expect(
    inspect(
      'export const run=()=>{const values=fp.getOrElse(fp.all([fp.ok(1)]),()=>[]);values.push(2);return values;}',
    ),
  ).toEqual([]);
  expect(inspect('export const run=()=>fp.validateAll([fp.ok(1)]);')).toEqual([]);
  expect(inspect('export const run=()=>fp.completeWithCleanup(fp.ok(1),[fp.ok()]);')).toEqual([]);
});

it('analyzes source-resolved implementations instead of assigning semantics by their names', () => {
  const files = [
    {
      path: 'src/helpers.ts',
      content: 'export const map=(value:number[],use:(value:number[])=>number)=>use(value);',
    },
    {
      path: 'src/caller.ts',
      content:
        'import {map} from "./helpers.ts"; /** @impure Mutate the input. */ const append=(value:number[])=>value.push(1); export const shared=(input:number[])=>map(input,append); export const local=()=>map([],append);',
    },
  ];
  const analyzed = analyzeSources({ files });
  const imports = analyzed.flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: file.source.path,
      imported,
      target: { kind: 'project' as const, path: 'src/helpers.ts' },
    })),
  );
  const issues = runChecks({ files, imports });
  expect(issues).toHaveLength(1);
  expect(issues[0]?.message).toContain('Function shared');
});
it('short-circuits outer failures and successful cleanup', () => {
  expect(inspect('export const run=()=>fp.map(fp.flatten(fp.err(1)),clock);')).toEqual([]);
  expect(inspect('export const run=()=>fp.completeWithCleanup(fp.ok(1),[fp.ok()],clock);')).toEqual(
    [],
  );
});

it('does not replay unrelated module initialization when a constant is read', () => {
  expect(
    inspect(
      '/** @impure Read time during module initialization. */ const factory=()=>{clock();return ()=>1;}; const value=factory()(); export const run=()=>value;',
    ).some((value) => value.message.includes('Function run')),
  ).toBe(false);
});
