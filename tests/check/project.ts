import { describe, expect, it } from 'vitest';
import { checkSourceProject as checkProject } from '#check/sources.b';
import { linkDependencies, withProject } from '#fixtures/project';

const relaxed = { rules: { 'strict-fp': false, boundary: false } } as const;
describe('project import graph', () => {
  it('loads source-condition configuration without a dist directory', () => {
    withProject(
      {
        'package.json':
          '{"name":"condition-test","type":"module","imports":{"#config":{"dev-source":"./src/config.ts","default":"./dist/config.js"}}}',
        'tsconfig.json':
          '{"compilerOptions":{"customConditions":["dev-source"],"moduleResolution":"NodeNext","module":"NodeNext"}}',
        'ts-calm.config.ts': 'export {default} from "#config";',
        'src/config.ts': 'export default {rules:{"strict-fp":false}};',
        'src/a.ts': 'export const value=null;',
      },
      (root) => expect(checkProject(root)).toEqual([]),
    );
  });
  it('includes type queries and constant template imports', () => {
    withProject(
      {
        'a.ts': 'export type A=import("./b.ts").B;',
        'b.ts': 'export type B=import("./a.ts").A;',
      },
      (root) =>
        expect(checkProject(root, relaxed).map((issue) => issue.rule)).toContain('no-file-cycles'),
    );
    withProject(
      {
        'a.ts': 'export const a=()=>import(`./b.ts`);',
        'b.ts': 'export const b=()=>import(`./a.ts`);',
      },
      (root) =>
        expect(checkProject(root, relaxed).map((issue) => issue.rule)).toContain('no-file-cycles'),
    );
  });
  it('resolves types conditions even for mixed value/type imports', () => {
    for (const statement of [
      'import type {T} from "@example/a";',
      'import {value,type T} from "@example/a";',
    ])
      withProject(
        {
          'packages/a/package.json':
            '{"name":"@example/a","type":"module","exports":{".":{"types":"./types.ts","import":"./index.ts"}}}',
          'packages/a/index.ts': 'export const value=1;',
          'packages/a/types.ts': 'export type {T} from "../../consumer.ts";',
          'consumer.ts': statement + ' export type {T};',
        },
        (root) => {
          const diagnostics = checkProject(root, relaxed);
          expect(diagnostics.filter((issue) => issue.rule === 'imports/resolve')).toEqual([]);
          expect(diagnostics.map((issue) => issue.rule)).toContain('no-file-cycles');
        },
      );
  });
  it.each([
    { 'src/a.ts': 'import {a} from "./a.ts"; export {a};' },
    {
      'src/a.ts': 'import type {B} from "./b.ts"; export type A={b:B};',
      'src/b.ts': 'import type {A} from "./a.ts"; export type B={a:A};',
    },
    {
      'src/a.ts': 'export * from "./b.ts";',
      'src/b.ts': 'export * from "./index.ts";',
      'src/index.ts': 'export * from "./a.ts";',
    },
    {
      'src/a.ts': 'export const load=()=>import("./b.ts");',
      'src/b.ts': 'export const load=()=>import("./a.ts");',
    },
  ])('reports each form of file cycle', (files) => {
    withProject(files, (root) => {
      const issues = checkProject(root, relaxed);
      expect(issues.some((issue) => issue.rule === 'no-file-cycles')).toBe(true);
      expect(issues.find((issue) => issue.rule === 'no-file-cycles')?.message).toContain(
        'src/a.ts',
      );
    });
  });
  it('accepts a shared leaf and builtin imports', () => {
    withProject(
      {
        'src/a.ts': 'export {x} from "./leaf.js"',
        'src/b.ts': 'export {x} from "./leaf.ts"',
        'src/leaf.ts': 'import {join} from "node:path"; export const x=join("a","b");',
      },
      (root) => expect(checkProject(root)).toEqual([]),
    );
  });
  it('resolves tsconfig paths and package imports aliases', () => {
    withProject(
      {
        'package.json': '{"name":"example","type":"module","imports":{"#src/*":"./src/*"}}',
        'tsconfig.json': '{"compilerOptions":{"paths":{"@src/*":["./src/*"]}}}',
        'src/a.ts': 'export * from "@src/b";',
        'src/b.ts': 'export * from "#src/a.ts";',
      },
      (root) =>
        expect(checkProject(root, relaxed).map((issue) => issue.rule)).toContain('no-file-cycles'),
    );
  });
  it('follows self exports and workspace package exports', () => {
    withProject(
      {
        'packages/a/package.json':
          '{"name":"@example/a","type":"module","exports":{".":"./src/index.ts","./value":"./src/value.ts"}}',
        'packages/a/src/index.ts': 'export {value} from "./value.ts";',
        'packages/a/src/value.ts': 'import {value} from "@example/a"; export {value};',
        'packages/b/package.json':
          '{"name":"@example/b","type":"module","exports":"./src/index.ts"}',
        'packages/b/src/index.ts': 'export {value} from "@example/a/value";',
      },
      (root) => {
        const diagnostics = checkProject(root, relaxed);
        expect(diagnostics.filter((issue) => issue.rule === 'imports/resolve')).toEqual([]);
        expect(diagnostics.map((issue) => issue.rule)).toContain('no-file-cycles');
      },
    );
  });
  it('reports unresolved imports, excluded project targets and syntax errors', () => {
    withProject(
      { 'src/a.ts': 'export * from "./missing.ts";', 'src/b.ts': 'export const = ;' },
      (root) =>
        expect(checkProject(root).map((issue) => issue.rule)).toEqual(
          expect.arrayContaining(['imports/resolve', 'source/parse']),
        ),
    );
    withProject(
      { 'src/a.ts': 'export * from "./b.ts";', 'src/b.ts': 'export const b=1;' },
      (root) =>
        expect(checkProject(root, { files: ['src/a.ts'] }).map((issue) => issue.rule)).toContain(
          'imports/resolve',
        ),
    );
  });
  it('does not traverse installed external dependencies', () => {
    withProject({ 'src/a.ts': 'import {ok} from "ts-calm"; export const a=ok(1);' }, (root) => {
      // An uninstalled dependency is an actionable resolution failure.
      expect(checkProject(root).map((issue) => issue.rule)).toContain('imports/resolve');
    });
    withProject(
      {
        'src/a.ts':
          'import {parseSync} from "oxc-parser"; export const a=()=>parseSync("a.ts", "");',
      },
      (root) => {
        linkDependencies(root);
        expect(checkProject(root)).toEqual([]);
      },
    );
  });
  it('loads a checked TypeScript configuration', () => {
    withProject(
      {
        'ts-calm.config.ts': 'export default {rules:{"strict-fp":false}}',
        'src/a.ts': 'export const f=()=>null;',
      },
      (root) => expect(checkProject(root)).toEqual([]),
    );
    withProject({ 'ts-calm.config.ts': 'export default {rules:{boundry:false}}' }, (root) =>
      expect(() => checkProject(root)).toThrow('boundry'),
    );
  });
});
