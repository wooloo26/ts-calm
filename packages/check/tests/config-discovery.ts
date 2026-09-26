import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSourceProject, loadConfiguration } from '@ts-calm/check';
import { withProject } from '#tests/fixtures/project';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const adapter =
  '/**\n * @boundary Open the external client.\n */\n' +
  'import Database from "database";\n' +
  'export const open=()=>new Database();';

describe('configuration discovery', () => {
  it('applies the configuration of an ancestor directory', async () => {
    await withProject(
      {
        'ts-calm.config.ts': 'export default {effectImports:["database"]};',
        'src/a.b.ts': adapter,
      },
      async (root) => {
        const fromProject = (await checkSourceProject(root)).map((issue) => issue.rule);
        const fromDirectory = (await checkSourceProject(join(root, 'src'))).map(
          (issue) => issue.rule,
        );
        expect(fromProject).toContain('boundary/undeclared');
        expect(fromDirectory).toContain('boundary/undeclared');
      },
    );
  });
  it('resolves one configuration per scanned directory, not one per file', async () => {
    await withProject(
      {
        'ts-calm.config.ts': 'export default {rules:{"strict-fp":false}};',
        'src/ts-calm.config.ts': 'export default {rules:{"strict-fp":{"no-null":false}}};',
        'src/a.ts': 'export const f=()=>undefined;',
      },
      async (root) => {
        expect(await checkSourceProject(root)).toEqual([]);
        expect((await checkSourceProject(join(root, 'src'))).map((issue) => issue.rule)).toContain(
          'strict-fp/no-undefined',
        );
      },
    );
  });
  it('reads no configuration when no ancestor declares one', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) =>
      expect(await checkSourceProject(join(root, 'src'))).toEqual([]),
    );
  });
  it('exposes this repository configuration to the commit policy', () => {
    const configuration = loadConfiguration(repository);
    expect(configuration.rules?.['commit-message']).toMatchObject({
      scopes: expect.arrayContaining(['root', 'fp', 'check', 'docs', 'build']),
    });
    expect(configuration.effectImports).toEqual(['oxc-resolver']);
  });
});
