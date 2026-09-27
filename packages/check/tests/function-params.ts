import { failureText, success } from '#tests/fixtures/result';
import { describe, expect, it } from 'vitest';
import { analyzeSources, explainRule, runChecks, validateConfiguration } from '@ts-calm/check';
import type { CheckConfig } from '@ts-calm/check';

const check = (content: string, config: CheckConfig = {}, path = 'src/value.ts') =>
  runChecks({ files: [{ path, content }] }, config).filter(
    (issue) => issue.rule === 'function-params',
  );
const four = 'a:number,b:number,c:number,d:number';

describe('parameter limits', () => {
  it.each([0, 1, 2, 3, 4, 5])('counts %i parameters', (count) => {
    const parameters = Array.from({ length: count }, (_, i) => `p${i}:number`).join(',');
    expect(check(`export function f(${parameters}) {return 1;}`)).toHaveLength(count > 3 ? 1 : 0);
  });
  it.each([
    `export function f(${four}) {return a;}`,
    `export const f=function(${four}) {return a;};`,
    `export const f=(${four})=>a;`,
    `export const f=async (${four})=>a;`,
    `export function* f(${four}) {yield a;}`,
    `export const obj={f(${four}) {return a;}};`,
    `export class C {f(${four}) {return a;}}`,
    `export class C {constructor(${four}) {}}`,
    'export class C {constructor(public a:number,b:number,c:number,d:number) {}}',
    `export abstract class C {abstract f(${four}):number;}`,
    `export type F=(${four})=>number;`,
    `export type F=new(${four})=>object;`,
    `export interface I {f(${four}):number;}`,
    `export interface I {(${four}):number;}`,
    `export interface I {new(${four}):object;}`,
    `declare function f(${four}):number;`,
    `export const f=()=>[1].map((${four})=>a);`,
  ])('checks callable shape %s', (content) => expect(check(content)).toHaveLength(1));
  it('checks each overload and implementation independently', () => {
    expect(check(`function f(${four}):number;\nfunction f(${four}) {return a;}`)).toHaveLength(2);
  });
  it('counts optional, default, destructured and rest parameters as one each', () => {
    expect(
      check('const f=({a}:{a:number}, [b]:number[], c=1, ...rest:number[])=>[a,b,c,rest];'),
    ).toHaveLength(1);
    expect(check('const f=(a:number,b?:number,c?:number,d?:number)=>a;')).toHaveLength(1);
    expect(
      check(
        'const f=({a,b,c,d}:{a:number,b:number,c:number,d:number},...rest:[number,number,number,number])=>a;',
      ),
    ).toEqual([]);
  });
  it('excludes this, generics and call arguments', () => {
    expect(check('function f<A,B,C,D>(this:object,a:A,b:B,c:C) {return [a,b,c];}')).toEqual([]);
    expect(check('type F<A,B,C,D>=(this:object,a:A,b:B,c:C)=>D;')).toEqual([]);
    expect(check('const f=(...args:number[])=>args; f(1,2,3,4,5);')).toEqual([]);
  });
  it('reports a multiline signature once at its start with help', () => {
    const issues = check(
      'export function f(\n a:number,\n b:number,\n c:number,\n d:number\n) {return a;}',
    );
    expect(issues).toEqual([
      expect.objectContaining({
        line: 1,
        column: 8,
        severity: 'error',
        help: expect.stringContaining('three'),
        docs: expect.stringContaining('function-params'),
      }),
    ]);
    expect(check(`class C {\n  method(${four}) {}\n}`)[0]).toMatchObject({ line: 2, column: 3 });
  });
  it('keeps bodyless signatures out of function-length facts', () => {
    const parsed = analyzeSources({
      files: [{ path: 'a.ts', content: `interface I {f(${four}):void} type F=(${four})=>number;` }],
    })[0]?.parsed;
    expect(parsed?.functions).toEqual([]);
    expect(parsed?.signatures).toHaveLength(2);
  });
  it('supports global and last matching override switches', () => {
    const content = `export const f=(${four})=>a;`;
    expect(check(content, { rules: { 'function-params': false } })).toEqual([]);
    expect(
      check(content, {
        rules: { 'function-params': false },
        overrides: [{ files: ['src/**'], rules: { 'function-params': true } }],
      }),
    ).toHaveLength(1);
    expect(
      check(content, {
        overrides: [
          { files: ['src/**'], rules: { 'function-params': true } },
          { files: ['src/*.ts'], rules: { 'function-params': false } },
        ],
      }),
    ).toEqual([]);
  });
  it.each(['tests/value.ts', 'scripts/value.ts', 'value.config.ts'])(
    'checks support files by default: %s',
    (path) => {
      expect(check(`const f=(${four})=>a;`, {}, path)).toHaveLength(1);
    },
  );
  it('keeps declaration files excluded', () =>
    expect(check(`declare function f(${four}):void;`, {}, 'src/value.d.ts')).toEqual([]));
  it('validates boolean configuration and rejects a configurable maximum', () => {
    expect(success(validateConfiguration({ rules: { 'function-params': true } }))).toEqual({
      rules: { 'function-params': true },
    });
    expect(
      failureText(validateConfiguration({ rules: { 'function-params': { maximum: 4 } } })),
    ).toContain('must be a boolean');
    expect(
      failureText(
        validateConfiguration({ overrides: [{ files: ['**'], rules: { 'function-params': 3 } }] }),
      ),
    ).toContain('booleans');
    expect(explainRule('function-params')).toContain('@allow function-params');
  });
});
