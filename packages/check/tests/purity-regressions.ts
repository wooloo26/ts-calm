import { expect, it } from 'vitest';
import { analyzeSources, runChecks } from '@ts-calm/check';
import { withProject } from '#tests/fixtures/project';
import { checkSourceProject } from '@ts-calm/check';

const config = { rules: { boundary: false, 'strict-fp': false } } as const;
const inspect = (content: string) =>
  runChecks({ files: [{ path: 'src/a.ts', content }] }, config).filter(
    (issue) => issue.rule === 'purity/impure',
  );

it.each(['map(value => ({ value }))', 'flatMap(value => [{ value }])'])(
  'keeps privately allocated %s elements private',
  (operation) => {
    expect(
      inspect(
        `export function build(input:readonly number[]) { const out=input.${operation}; const first=out.at(0); if(first) first.value=2; return out; }`,
      ),
    ).toEqual([]);
  },
);

it.each(['map(value => value)', 'flatMap(value => [value])', 'filter(() => true)', 'slice()'])(
  'preserves shared references through %s',
  (operation) => {
    expect(
      inspect(
        `export function change(input:readonly {value:number}[]) { const out=input.${operation}; const first=out.at(0); if(first) first.value=2; }`,
      ),
    ).toHaveLength(1);
  },
);

it.each(['number[]', 'Items'])('finds array mutation through %s', (annotation) => {
  expect(
    inspect(`type Items=number[]; export const change=(values:${annotation})=>values.push(1);`),
  ).toHaveLength(1);
});

it('resolves imported aliases before deciding whether a collection mutates', async () => {
  await withProject(
    {
      'src/types.ts': 'export type Items = Map<string,number>;',
      'src/a.ts':
        'import type {Items} from "./types.ts"; export const change=(values:Items)=>values.set("x",1);',
    },
    async (root) =>
      expect(
        (await checkSourceProject(root, config)).filter((issue) => issue.rule === 'purity/impure'),
      ).toHaveLength(1),
  );
});

it('tracks for-of element ownership and destructuring', () => {
  expect(
    inspect(
      'export function change(input:{value:number}[]){for(const item of input){item.value=2;}}',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      'export function change(input:{nested:{value:number}}[]){for(const {nested} of input){nested.value=2;}}',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      'export function build(){const input=[{value:1}];for(const item of input){item.value=2;}return input;}',
    ),
  ).toEqual([]);
});

it('tracks references assigned to a private object property', () => {
  expect(
    inspect(
      'export function change(input:{value:number}){const box:{nested?:{value:number}}={};box.nested=input;box.nested.value=2;}',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      'export function build(){const box:{nested?:{value:number}}={};box.nested={value:1};box.nested.value=2;return box;}',
    ),
  ).toEqual([]);
});

it('distinguishes unconditional private replacement from a conditional shared reference', () => {
  expect(
    inspect(
      'export function run(input:{value:number}){const box={item:input};box.item={value:0};box.item.value=1;}',
    ),
  ).toEqual([]);
  expect(
    inspect(
      'export function run(input:{value:number},replace:boolean){const box={item:input};if(replace)box.item={value:0};box.item.value=1;}',
    ),
  ).toHaveLength(1);
});

it('tracks both comparator arguments and the array passed to mapping callbacks', () => {
  expect(
    inspect(
      'export const run=(input:{value:number}[])=>input.toSorted((a,b)=>{b.value=1;return a.value-b.value;});',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      'export const run=(input:number[])=>input.map((value,index,array)=>{array.push(index);return value;});',
    ),
  ).toHaveLength(1);
});

it('propagates toSorted comparator effects without treating the new array as shared', () => {
  expect(
    inspect(
      '/** @impure Read randomness. */ const compare=()=>Math.random(); export const sort=(input:readonly number[])=>input.toSorted(compare);',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      'export const sort=(input:readonly number[])=>{const output=input.toSorted((a,b)=>a-b);output.push(1);return output;}',
    ),
  ).toEqual([]);
});

it.each(['@ts-calm/fp', '@ts-calm/fp/boundary'])(
  'propagates known external callbacks from %s',
  (specifier) => {
    const expression = specifier.endsWith('/boundary')
      ? 'capture(now, {name:"clock"})'
      : 'map(ok(1), now)';
    const names = specifier.endsWith('/boundary') ? 'capture' : 'map,ok';
    const files = [
      {
        path: 'src/a.ts',
        content: `import {${names}} from '${specifier}'; /** @impure Read time. */ const now=()=>Date.now(); export const run=()=>${expression};`,
      },
    ];
    const imports = analyzeSources({ files }, config).flatMap((file) =>
      file.parsed.imports.map((imported) => ({
        file: file.source.path,
        imported,
        target: { kind: 'external' as const },
      })),
    );
    expect(
      runChecks({ files, imports }, config).filter((issue) => issue.rule === 'purity/impure'),
    ).toHaveLength(1);
  },
);
