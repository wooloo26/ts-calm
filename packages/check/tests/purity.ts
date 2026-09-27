import { success } from '#tests/fixtures/result';
import { describe, expect, it } from 'vitest';
import { checkSourceProject, runChecks } from '@ts-calm/check';
import { withProject } from '#tests/fixtures/project';

const inspect = (content: string) =>
  runChecks(
    { files: [{ path: 'src/example.ts', content }] },
    { rules: { boundary: false, 'strict-fp': false } },
  ).filter((issue) => issue.rule.startsWith('purity/'));

describe('pure by convention', () => {
  it('requires attached JSDoc and respects per-file enabling', () => {
    expect(
      inspect('// @impure Read the clock.\nexport const now=()=>Date.now();').some(
        (item) => item.rule === 'purity/placement',
      ),
    ).toBe(true);
    expect(
      inspect('/** @impure Read time. @impure Repeat. */\nexport const now=()=>Date.now();').some(
        (item) => item.rule === 'purity/duplicate',
      ),
    ).toBe(true);
    const file = { path: 'src/a.ts', content: 'export const now=()=>Date.now();' };
    expect(
      runChecks(
        { files: [file] },
        { rules: { purity: false, boundary: false, 'strict-fp': false } },
      ),
    ).toEqual([]);
    expect(
      runChecks(
        { files: [file] },
        {
          rules: { purity: false, boundary: false, 'strict-fp': false },
          overrides: [{ files: ['src/**'], rules: { purity: true } }],
        },
      ).some((item) => item.rule === 'purity/impure'),
    ).toBe(true);
  });
  it('requires a reason for known effects but accepts an explicit declaration', () => {
    expect(inspect('export const clock=()=>Date.now();')[0]?.message).toContain('clock');
    expect(
      inspect('/** @impure Read the system clock. */\nexport const clock=()=>Date.now();'),
    ).toEqual([]);
    expect(
      inspect('/** @impure */\nexport const clock=()=>Date.now();').map((issue) => issue.rule),
    ).toContain('purity/reason');
  });
  it('allows local loops and private collection construction', () => {
    expect(
      inspect(
        'export function total(values:readonly number[]){let n=0;const out:number[]=[];const lookup=new Map<number,number>();for(const value of values){n+=value;out.push(n);lookup.set(value,n)}return out}',
      ),
    ).toEqual([]);
  });
  it('checks default arguments without applying their effects to calls supplying a value', () => {
    expect(inspect('export const now=(value=Date.now())=>value;')).toHaveLength(1);
    expect(
      inspect(
        '/** @impure Read time when the argument is omitted. */ const now=(value=Date.now())=>value; export const fixed=()=>now(1);',
      ),
    ).toEqual([]);
    expect(
      inspect('export function append(values:number[]=[]){values.push(1);return values}'),
    ).toHaveLength(1);
  });
  it('finds parameter writes and direct aliases', () => {
    expect(
      inspect('export function change(input:{value:number}){const other=input;other.value=2}'),
    ).toHaveLength(1);
    expect(inspect('export function change(input:number[]){input.sort()}')).toHaveLength(1);
    expect(
      inspect('export function change(input:Map<string,number>){input.set("x",1)}'),
    ).toHaveLength(1);
  });
  it('does not mistake a shallow copy for privately owned nested data', () => {
    expect(
      inspect(
        'export function change(input:{nested:{value:number}}){const copy={...input};copy.nested.value=2}',
      ),
    ).toHaveLength(1);
    expect(
      inspect(
        'export function change(input:readonly {value:number}[]){const copy=[...input];copy[0].value=2}',
      ),
    ).toHaveLength(1);
    expect(
      inspect(
        'export function change(input:readonly number[]){const copy=[...input];copy.sort();return copy}',
      ),
    ).toEqual([]);
  });
  it('finds captured state writes and reads of state known to change', () => {
    const issues = inspect(
      'let counter=0;export const next=()=>++counter;export const current=()=>counter;',
    );
    expect(issues).toHaveLength(2);
    expect(
      inspect(
        'const state={value:0};export const next=()=>++state.value;export const current=()=>state.value;',
      ),
    ).toHaveLength(2);
  });
  it('tracks a module-level collection and its object alias', () => {
    expect(
      inspect(
        'const values=new Map<string,number>();const alias=values;export const set=()=>alias.set("x",1);export const read=()=>values.get("x");',
      ),
    ).toHaveLength(2);
  });
  it('propagates known calls while not propagating private temporary mutation', () => {
    expect(
      inspect(
        '/** @impure Read time. */ const clock=()=>Date.now(); export const now=()=>clock();',
      ),
    ).toHaveLength(1);
    expect(
      inspect(
        '/** @impure Append to the provided array. */ function append(out:number[]){out.push(1)} export function build(){const out:number[]=[];append(out);return out}',
      ),
    ).toEqual([]);
  });
  it('does not execute functions merely because they are returned', () => {
    expect(
      inspect(
        'export function factory(){/** @impure Read time when invoked. */ const clock=()=>Date.now();return clock}',
      ),
    ).toEqual([]);
  });
  it('keeps a caller pure when an invoked closure only changes its private counter', () => {
    expect(
      inspect(
        'export function build(){let n=0;/** @impure Increment the captured counter. */ const increment=()=>++n;increment();return n}',
      ),
    ).toEqual([]);
  });
  it('attributes an immediately invoked callback to its named caller', () => {
    expect(inspect('export const now=()=>[1].map(()=>Date.now());')).toHaveLength(1);
    expect(
      inspect(
        '/** @impure Read time while mapping. */\nexport const now=()=>[1].map(()=>Date.now());',
      ),
    ).toEqual([]);
  });
  it('supports effect-polymorphic project helpers without marking the helper itself', () => {
    expect(
      inspect('const invoke=(fn:()=>number)=>fn(); export const now=()=>invoke(()=>Date.now());'),
    ).toHaveLength(1);
    expect(
      inspect('const invoke=(fn:()=>number)=>fn(); export const value=()=>invoke(()=>1);'),
    ).toEqual([]);
  });
  it('keeps unknown calls unproven rather than forcing a pure annotation', () => {
    expect(inspect('declare const external:()=>number;export const value=()=>external();')).toEqual(
      [],
    );
  });
  it('uses an explicit declaration when an external effect is opaque', () => {
    expect(
      inspect(
        'declare const external:()=>number;/** @impure Invoke the external device API. */ const device=()=>external(); export const value=()=>device();',
      ),
    ).toHaveLength(1);
  });
  it('propagates project imports and reports the call path', async () => {
    await withProject(
      {
        'src/clock.ts': '/** @impure Read time. */ export const clock=()=>Date.now();',
        'src/run.ts': 'import {clock as read} from "./clock.ts"; export const run=()=>read();',
      },
      async (root) => {
        const issues = success(
          await checkSourceProject(root, {
            rules: { boundary: false, 'strict-fp': false },
          }),
        ).filter((issue) => issue.rule.startsWith('purity/'));
        expect(issues).toHaveLength(1);
        expect(issues[0]?.help).toContain('clock');
      },
    );
  });
  it('does not allow impure annotations to bypass the boundary rule', () => {
    const issues = runChecks({
      files: [
        { path: 'src/a.ts', content: '/** @impure Read time. */ export const now=()=>Date.now();' },
      ],
    });
    expect(issues.some((issue) => issue.rule === 'boundary/effect')).toBe(true);
  });
});
