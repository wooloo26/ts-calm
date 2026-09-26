import { expect, it } from 'vitest';
import { checkSourceProject } from '@ts-calm/check';
import { withProject } from '#tests/fixtures/project';

it('finds directory cycles without a file cycle and reports concrete witness locations', async () => {
  await withProject(
    {
      'orders/read.ts': 'import type {Stock} from "../stock/types.ts"; export type Order=Stock;',
      'stock/types.ts': 'export type Stock=number;',
      'stock/write.ts': 'export {order} from "../orders/types.ts";',
      'orders/types.ts': 'export const order=1;',
    },
    async (root) => {
      const diagnostics = await checkSourceProject(root);
      expect(diagnostics.some((item) => item.rule === 'no-file-cycles')).toBe(false);
      const issue = diagnostics.find((item) => item.rule === 'no-module-cycles');
      expect(issue?.message).toContain('orders -> stock -> orders');
      expect(issue?.help).toContain('orders/read.ts:1 -> stock/types.ts');
      expect(issue?.help).toContain('stock/write.ts:1 -> orders/types.ts');
      expect(await checkSourceProject(root, { rules: { 'no-module-cycles': false } })).toEqual([]);
    },
  );
});

it('ignores intra-directory edges and treats subdirectories as separate modules', async () => {
  await withProject(
    { 'a/read.ts': 'export {value} from "./value.ts";', 'a/value.ts': 'export const value=1;' },
    async (root) => expect(await checkSourceProject(root)).toEqual([]),
  );
  await withProject(
    {
      'a/read.ts': 'export {value} from "./sub/value.ts";',
      'a/sub/value.ts': 'export const value=1;',
      'a/sub/reader.ts': 'export {value} from "../types.ts";',
      'a/types.ts': 'export const value=1;',
    },
    async (root) =>
      expect((await checkSourceProject(root)).map((item) => item.rule)).toContain(
        'no-module-cycles',
      ),
  );
});

it('includes literal dynamic imports and test directories', async () => {
  await withProject(
    {
      'tests/a.ts': 'export const a=()=>import("../src/one.ts");',
      'src/one.ts': 'export const one=1;',
      'src/two.ts': 'export {two} from "../tests/b.ts";',
      'tests/b.ts': 'export const two=2;',
    },
    async (root) =>
      expect((await checkSourceProject(root)).map((item) => item.rule)).toContain(
        'no-module-cycles',
      ),
  );
});
