import { failureText } from '#tests/fixtures/result';
import { describe, expect, it } from 'vitest';
import { analyzeSources, runChecks, validateConfiguration } from '@ts-calm/check';
import type { CheckConfig } from '@ts-calm/check';

const lint = (content: string, path = 'src/value.ts', config: CheckConfig = {}) => {
  const files = [{ path, content }];
  const imports = analyzeSources({ files }, config).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: path,
      imported,
      target: { kind: 'external' as const },
    })),
  );
  return runChecks({ files, imports }, config);
};
const rules = (content: string, path = 'src/value.ts', config: CheckConfig = {}) =>
  lint(content, path, config).map((issue) => issue.rule);
const boundary = (tags: string, code: string) =>
  `/**\n * @boundary Adapt external values and return an explicit result.\n${tags}\n */\n${code}`;

describe('strict-fp', () => {
  it.each([
    ['no-throw', 'export function f(){throw Error("x")}'],
    ['no-try', 'export function f(){try {return 1} catch {return 2}}'],
    ['no-assertion', 'export const f=(x:unknown)=>x as string'],
    ['no-any', 'export const f=(x:any)=>x'],
    ['no-non-null', 'export const f=(x?:string)=>x!'],
    ['no-null', 'export const f=()=>null'],
    ['no-null', 'export type Empty=null'],
    ['no-undefined', 'export const f=()=>undefined'],
    ['no-class', 'export class Example {}'],
    ['no-this', 'export function f(){return this}'],
    ['no-var', 'export function f(){var x=1; return x}'],
    ['no-delete', 'export function f(x:{a?:number}){delete x.a}'],
    ['no-module-state', 'export let x=1'],
  ])('reports %s', (name, code) => expect(rules(code)).toContain(`strict-fp/${name}`));
  it('allows local mutation, loops, native JSON, const assertions and pure external imports', () => {
    expect(
      lint(
        'import { join } from "node:path"; export function f(){let x=0; for(let i=0;i<2;i++) x+=i; return [join("a","b"), JSON.stringify(x)] as const}',
      ),
    ).toEqual([]);
  });
  it('supports whole-rule and individual configuration', () => {
    expect(lint('export const f=()=>null', 'src/a.ts', { rules: { 'strict-fp': false } })).toEqual(
      [],
    );
    expect(
      lint('export const f=()=>null', 'src/a.ts', { rules: { 'strict-fp': { 'no-null': false } } }),
    ).toEqual([]);
  });
  it('does not confuse object keys with undefined sentinel reads', () => {
    expect(lint('export const f=()=>({undefined:1})')).toEqual([]);
    expect(rules('export const f=()=>({undefined})')).toContain('strict-fp/no-undefined');
  });
});

describe('boundary declarations', () => {
  it('follows destructuring aliases and hoisted imports without treating parameter shadowing as effects', () => {
    expect(
      rules(
        'import * as fs from "node:fs"; const {readFileSync:read}=fs; export const f=()=>read("x");',
      ),
    ).toContain('boundary/effect');
    expect(
      rules('export const f=()=>readFileSync("x"); import {readFileSync} from "node:fs";'),
    ).toContain('boundary/effect');
    expect(
      lint(
        'import {readFileSync} from "node:fs"; export const f=(readFileSync:()=>number)=>readFileSync();',
      ),
    ).toEqual([]);
  });
  it('rejects incomplete caller-provided resolution graphs', () => {
    expect(
      runChecks({
        files: [{ path: 'src/a.ts', content: 'export * from "./b.ts"' }],
        imports: [],
      }).map((issue) => issue.rule),
    ).toContain('imports/resolve');
  });
  it('requires a real implementation, reason, and valid suffix', () => {
    expect(rules('export const value=1', 'src/a.b.ts')).toEqual(
      expect.arrayContaining(['boundary/reason', 'boundary/purpose']),
    );
    expect(rules(boundary('', 'export type Value=string'), 'src/a.b.ts')).toContain(
      'boundary/purpose',
    );
    expect(rules(boundary('', 'export {x} from "./b.b.ts"'), 'src/a.b.ts')).toContain(
      'boundary/purpose',
    );
    expect(rules(boundary('', 'export const value=1'))).toContain('boundary/suffix');
    expect(rules('export const f=()=>1;\n' + boundary('', ''), 'src/a.b.ts')).toContain(
      'boundary/reason',
    );
  });
  it('rejects declaring an import as proof without using it', () => {
    const code = boundary(
      ' * @effects node:fs',
      'import {readFileSync} from "node:fs"; export const f=()=>1',
    );
    expect(rules(code, 'src/a.b.ts')).toContain('boundary/unused');
  });
  it('checks direct effects and accepts a narrow actual allowance', () => {
    const body =
      'import {readFileSync} from "node:fs"; /** @impure Read the external file. */ export function f(){\n// @allow strict-fp/no-try -- Convert filesystem failures here.\ntry {return readFileSync("a")} catch{return ""}}';
    expect(rules(body)).toContain('boundary/effect');
    const code = boundary(' * @effects node:fs', body);
    expect(lint(code, 'src/a.b.ts')).toEqual([]);
    expect(lint(code, 'src/a.b.ts', { rules: { 'strict-fp': false } })).toEqual([]);
  });
  it('accepts all strict-fp exceptions without disabling unrelated rules', () => {
    const code = boundary(
      '',
      '// @allow strict-fp/no-any -- Adapt the external callback.\n// @allow strict-fp/no-null -- Preserve the protocol sentinel.\nexport const f=(value:any)=>value ?? null;',
    );
    expect(lint(code, 'src/a.b.ts')).toEqual([]);
    const missingEffect = code + '\nexport const now=()=>Date.now();';
    expect(rules(missingEffect, 'src/a.b.ts')).toContain('boundary/undeclared');
  });
  it('rejects unused, duplicated, malformed and unknown declarations', () => {
    for (const tag of ['@effects node:fs'])
      expect(rules(boundary(` * ${tag}`, 'export const f=()=>1'), 'src/a.b.ts')).toContain(
        'boundary/unused',
      );
    expect(
      rules(boundary(' * @allow strict-fp/no-null', 'export const f=()=>null'), 'src/a.b.ts'),
    ).toContain('boundary/allow');
    expect(
      rules(boundary(' * @allow no-file-cycles -- please', 'export const f=()=>1'), 'src/a.b.ts'),
    ).toContain('boundary/allow');
    expect(rules(boundary(' * @effect node:fs', 'export const f=()=>1'), 'src/a.b.ts')).toContain(
      'boundary/tag',
    );
    expect(
      rules(
        boundary(
          '',
          '// @allow strict-fp/no-null -- adapt\n// @allow strict-fp/no-null -- adapt\nexport const f=()=>null',
        ),
        'src/a.b.ts',
      ),
    ).toContain('boundary/duplicate');
  });
  it('allows ordinary composition to call an adapter', () => {
    expect(lint('import {read} from "./read.b.ts"; export const run=()=>read();')).toEqual([]);
  });
  it('recognizes platform effects, aliases and configured dependencies', () => {
    for (const code of [
      'export const f=()=>Date.now()',
      'export const f=()=>new Date()',
      'export const f=()=>Math.random()',
      'export const f=()=>globalThis.fetch("/")',
      'export const f=()=>process.env["X"]',
      'import * as fs from "node:fs"; export const f=()=>fs.readFileSync("x")',
      'import {randomUUID as id} from "node:crypto"; export const f=()=>id()',
      'import * as crypto from "node:crypto"; export const f=()=>crypto.randomUUID()',
      'const clock=Date.now; export const f=()=>clock()',
    ])
      expect(rules(code)).toContain('boundary/effect');
    expect(
      rules('import Database from "database"; export const f=()=>new Database()', 'src/a.ts', {
        effectImports: ['database'],
      }),
    ).toContain('boundary/effect');
  });
  it('does not report shadowed globals or deterministic date construction', () => {
    expect(lint('export const f=(fetch:()=>number)=>fetch();')).toEqual([]);
    expect(lint('export const f=()=>new Date(0);')).toEqual([]);
  });
  it('keeps tests and config exempt only from boundary and strict-fp by default', () => {
    expect(lint('export const f=()=>Date.now() ?? null', 'tests/value.ts')).toEqual([]);
    expect(
      rules('export const f=()=>null', 'tests/value.ts', {
        overrides: [{ files: ['tests/**'], rules: { 'strict-fp': true } }],
      }),
    ).toContain('strict-fp/no-null');
  });
  it('reports parse errors and computed imports regardless of disabled rules', () => {
    expect(rules('export const = ;')).toContain('source/parse');
    expect(rules('export const load=(name:string)=>import(name)')).toContain('source/parse');
  });
});

describe('function length', () => {
  const long = (lines: number) =>
    `export const f=()=>{\n${Array.from({ length: lines }, (_, i) => `const n${i}=${i};`).join('\n')}\n};`;
  it('counts only the body lines, so the threshold is exactly 80 and 150', () => {
    expect(lint(long(80))).toEqual([]);
    expect(lint(long(81))[0]?.severity).toBe('warning');
    expect(lint(long(150))[0]?.severity).toBe('warning');
    expect(lint(long(151))[0]?.severity).toBe('error');
  });
  it('does not count the declaration braces as lines', () => {
    expect(lint('export const f=()=>{return 1};')).toEqual([]);
    expect(lint('export function f(){return 1}')).toEqual([]);
    expect(lint('export const f=()=>({\n  a: 1,\n})')).toEqual([]);
  });
  it('ignores comments, empty lines and nested function bodies', () => {
    expect(lint(long(2).replace('{', `{\n${'// comment\n\n'.repeat(200)}`))).toEqual([]);
    const inner = long(151).replace('export const f', 'const inner');
    const output = lint(`export const outer=()=>{\n${inner}\n};`);
    expect(output).toHaveLength(1);
    expect(output[0]?.message).toContain('inner');
  });
  it('requires a valid attached reason and detects stale allowances', () => {
    expect(
      lint(
        '// calm-allow-next-function function-length -- Single cohesive generated dispatch.\n' +
          long(151),
      ),
    ).toEqual([]);
    expect(rules('// calm-allow-next-function function-length\n' + long(151))).toEqual(
      expect.arrayContaining(['function-length/allow-invalid', 'function-length']),
    );
    expect(rules('// calm-allow-next-function function-length -- old\n' + long(1))).toContain(
      'function-length/allow-stale',
    );
    expect(rules('// calm-allow-next-function function-length -- orphan')).toContain(
      'function-length/allow-orphan',
    );
  });
});

describe('configuration and commits', () => {
  it('rejects misspelled and impossible options', () => {
    for (const input of [
      { rules: { boundry: true } },
      { files: [12] },
      { effectImports: null },
      { rules: { 'function-length': { warning: 200, maximum: 150 } } },
      { overrides: [{ files: ['**'], rules: { 'no-file-cycles': false } }] },
    ])
      expect(failureText(validateConfiguration(input))).not.toBe('');
  });
});
