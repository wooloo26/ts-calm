import { success } from '#tests/fixtures/result';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkSourceProject } from '@ts-calm/check';
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
        const fromProject = success(await checkSourceProject(root)).map((issue) => issue.rule);
        const fromDirectory = success(await checkSourceProject(join(root, 'src'))).map(
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
        expect(success(await checkSourceProject(root))).toEqual([]);
        expect(
          success(await checkSourceProject(join(root, 'src'))).map((issue) => issue.rule),
        ).toContain('strict-fp/no-undefined');
      },
    );
  });
  it('reads no configuration when no ancestor declares one', async () => {
    await withProject({ 'src/a.ts': 'export const a=1;' }, async (root) =>
      expect(success(await checkSourceProject(join(root, 'src')))).toEqual([]),
    );
  });
  it('exposes this repository configuration to the commit policy', () => {
    // Exercise native synchronous ESM loading outside Vitest's transformed module graph.
    // Loading both forms of the same source URL in one isolate corrupts V8 range merging.
    const result = spawnSync(
      process.execPath,
      [
        '--conditions=source',
        '--input-type=module',
        '-e',
        'import { loadConfiguration } from "./packages/check/src/config-reader.b.ts"; import {get,getError,isErr} from "./packages/fp/src/index.ts"; const result=loadConfiguration(process.cwd()); if(isErr(result)) throw new Error(JSON.stringify(getError(result))); console.log(JSON.stringify(get(result)));',
      ],
      { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 30000 },
    );
    expect(result.status, result.stderr).toBe(0);
    const configuration = JSON.parse(result.stdout);
    expect(configuration.rules?.['commit-message']).toMatchObject({
      scopes: expect.arrayContaining(['root', 'fp', 'check', 'docs', 'build']),
    });
    expect(configuration.effectImports).toEqual(['oxc-resolver']);
  });
});
