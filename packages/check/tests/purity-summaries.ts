import { expect, it } from 'vitest';
import { analyzeSources, runChecks } from '@ts-calm/check';
import { projectOf } from '#src/rules/purity/index';
import { evaluatePurity } from '#src/rules/purity/eval';
import { callGraph } from '#tests/fixtures/graphs';

const config = { rules: { boundary: false, 'strict-fp': false } } as const;
const inspect = (content: string) =>
  runChecks({ files: [{ path: 'src/a.ts', content }] }, config).filter(
    (issue) => issue.rule === 'purity/impure',
  );

it.each(['chain', 'diamond', 'fanout'] as const)(
  'bounds context expansion in a %s call graph',
  (kind) => {
    const content = callGraph(kind, 18);
    const project = projectOf(
      analyzeSources({ files: [{ path: 'src/a.ts', content }] }, config),
      [],
      config,
    );
    const root = [...project.functions.values()].find((fn) => fn.name === 'f18');
    expect(root).toBeDefined();
    if (!root) return;
    const result = evaluatePurity(project, root, new Set());
    expect(result.effects.size).toBe(0);
    expect(result.expansions).toBeLessThanOrEqual(kind === 'diamond' ? 55 : 19);
    if (kind !== 'chain') expect(result.cacheHits).toBeGreaterThan(0);
    expect(result.incomplete).toBe(false);
  },
);

it('reports exhausted analysis as a warning rather than a purity guarantee', () => {
  const leaves = Array.from({ length: 520 }, (_, index) => `const leaf${index}=()=>${index};`).join(
    '\n',
  );
  const calls = Array.from({ length: 520 }, (_, index) => `leaf${index}();`).join('\n');
  const issues = runChecks(
    { files: [{ path: 'src/a.ts', content: `${leaves}\nexport const run=()=>{${calls}};` }] },
    { rules: { ...config.rules, 'function-length': false } },
  );
  expect(issues).toContainEqual(
    expect.objectContaining({ rule: 'purity/incomplete', severity: 'warning' }),
  );
  expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
});

it('keeps callback arguments and parameter ownership in the summary context', () => {
  expect(
    inspect(
      'const invoke=(fn:()=>number)=>fn(); /** @impure Read time. */ const clock=()=>Date.now(); export function run(){invoke(()=>1);return invoke(clock);}',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      '/** @impure Append to caller array. */ const append=(out:number[])=>out.push(1); export function run(input:number[]){append([]);append(input);}',
    ),
  ).toHaveLength(1);
  expect(
    inspect(
      '/** @impure Append to caller array. */ const append=(out:number[])=>out.push(1); export function run(){const first:number[]=[];append(first);const second:number[]=[];append(second);return second;}',
    ),
  ).toEqual([]);
});

it('follows recursive calls with different callback arguments', () => {
  expect(
    inspect(
      '/** @impure Read time. */ const clock=()=>Date.now(); const recurse=(fn:()=>number,n:number):number=>n?recurse(clock,n-1):fn(); export const run=()=>recurse(()=>1,2);',
    ),
  ).toHaveLength(2);
});

it('settles recursive return dependencies before using their effects', () => {
  const source =
    '/** @impure Read time. */ const clock=()=>Date.now(); function left(n:number):()=>number {return n?right(n-1):clock;} function right(n:number):()=>number{return left(n);} export const run=()=>right(2)();';
  expect(inspect(source)).toHaveLength(1);
  expect(
    inspect(
      'function left(n:number):number{return n?right(n-1):1;} function right(n:number):number{return left(n);} export const run=()=>right(2);',
    ),
  ).toEqual([]);
});

it('propagates opaque declarations through arbitrary call depths', () => {
  const content = [
    'declare const external:()=>number;',
    '/** @impure Read the device. */ const f0=()=>external();',
    ...Array.from({ length: 7 }, (_, index) => `const f${index + 1}=()=>f${index}();`),
  ].join('\n');
  expect(inspect(content)).toHaveLength(7);
});

it('invalidates cached reads after private heap mutation', () => {
  expect(
    inspect(
      'export function run(input:{value:number}){const box:{item:{value:number}}={item:{value:0}};const read=()=>box.item;read();box.item=input;read().value=2;}',
    ),
  ).toHaveLength(1);
});

it('does not share allocations returned by two calls to the same factory', () => {
  expect(
    inspect(
      'const create=()=>({item:{value:0}});export function run(input:{value:number}){const first=create();const second=create();first.item=input;second.item.value=2;}',
    ),
  ).toEqual([]);
});

it('tracks readers declared before a captured-state writer', () => {
  expect(
    inspect(
      'const state={value:0};export const read=()=>state.value;export const write=()=>++state.value;',
    ),
  ).toHaveLength(2);
});

it('stops at a deterministic context budget and exposes incomplete analysis', () => {
  const content = [
    'const leaf=()=>1;',
    ...Array.from(
      { length: 12 },
      (_, index) => `const f${index}=()=>${index ? `f${index - 1}` : 'leaf'}();`,
    ),
  ].join('\n');
  const project = projectOf(
    analyzeSources({ files: [{ path: 'src/a.ts', content }] }, config),
    [],
    config,
  );
  const root = [...project.functions.values()].find((fn) => fn.name === 'f11');
  if (!root) throw new Error('Missing fixture function');
  const result = evaluatePurity(project, root, new Set(), 8);
  expect(result.expansions).toBe(8);
  expect(result.incomplete).toBe(true);
});
