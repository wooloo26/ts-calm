import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withProject, write, initializeGit } from '../tests/fixtures/project.ts';

const cli = fileURLToPath(new URL('../dist/cli.b.js', import.meta.url));
const run = (root: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [cli, ...args, '--cwd', root], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
};

const fpUrl = new URL('../../fp/dist/index.js', import.meta.url).href;
const boundaryUrl = new URL('../../fp/dist/boundary.js', import.meta.url).href;
const fp = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
  import assert from 'node:assert/strict';
  const { ok, get, map, isOk, isErr, lookup, isSome, encodeJson } = await import(${JSON.stringify(fpUrl)});
  const { capture } = await import(${JSON.stringify(boundaryUrl)});
  assert.equal(get(map(ok(2), value => value + 1)), 3);
  assert.equal(isOk({ ...ok(1) }), false);
  assert.equal(isSome(lookup(new Map([['a', undefined]]), 'a')), true);
  assert.equal(get(encodeJson({ value: 1 }, { encode: value => value, decode: ok })), '{"value":1}');
  assert.equal(isErr(capture(() => { throw new Error('expected'); }, { name: 'smoke' })), true);
`,
  ],
  { encoding: 'utf8', windowsHide: true, timeout: 30000 },
);
assert.ifError(fp.error);
assert.equal(fp.status, 0, fp.stderr);

await withProject(
  {
    'package.json': '{}',
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, module: 'NodeNext', target: 'ES2024', types: [] },
      include: ['src/**/*.ts'],
    }),
    'src/a.ts': 'export const value = 1;',
    'ts-calm.config.ts': 'export default {rules:{"commit-message":{scopes:["smoke"]}}};',
  },
  async (root) => {
    const initialized = run(root, 'init', '--json');
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.deepEqual(JSON.parse(initialized.stdout), {
      created: [],
      updated: ['package.json'],
      warnings: [],
    });
    assert.equal(run(root, '--help').status, 0);
    const version = spawnSync(process.execPath, [cli, '--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(version.status, 0);
    assert.match(version.stdout, /^\d+\.\d+\.\d+/);
    assert.equal(run(root, 'explain', 'purity', '--json').status, 0);
    assert.match(run(root, 'explain', 'function-params').stdout, /at most three/);
    assert.equal(run(root, 'check').status, 0);
    assert.equal(run(root, 'typecheck', '--json').status, 0);
    initializeGit(root);
    assert.equal(run(root, 'check', '--staged').status, 0);
    write(root, 'message', 'smoke - validate built artifacts');
    assert.equal(run(root, 'commit-message', '--file', 'message', '--json').status, 0);
    write(root, 'src/a.ts', 'export const value: string = 1;');
    const typeError = run(root, 'typecheck', '--json');
    assert.equal(typeError.status, 1);
    assert.match(typeError.stdout, /typecheck\/TS2322/);
    write(root, 'src/a.ts', 'export const value = null;');
    const violation = run(root, 'check', '--json');
    assert.equal(violation.status, 1);
    assert.match(violation.stdout, /strict-fp\/no-null/);
    write(root, 'src/a.ts', 'export const f=(a:number,b:number,c:number,d:number)=>[a,b,c,d];');
    const parameters = run(root, 'check', '--json');
    assert.equal(parameters.status, 1);
    assert.match(parameters.stdout, /function-params/);
    write(root, 'src/a.ts', 'export const value=1;');
    const adapter =
      '/** @boundary Adapt the fixed vendor callback. */\n' +
      '// @allow function-params -- The vendor supplies four separate arguments.\n' +
      'export const f=(a:number,b:number,c:number,d:number)=>[a,b,c,d];';
    write(root, 'src/adapter.b.ts', adapter);
    assert.equal(run(root, 'check').status, 0);
    initializeGit(root);
    write(root, 'src/adapter.b.ts', adapter + '\nexport const unallowed=()=>null;');
    assert.equal(run(root, 'check', '--staged').status, 0);
    const scoped = run(root, 'check', '--json');
    assert.equal(scoped.status, 1);
    assert.match(scoped.stdout, /strict-fp\/no-null/);
    assert.doesNotMatch(scoped.stdout, /function-params/);
    const invalid = run(root, 'check', '--unknown', '--json');
    assert.equal(invalid.status, 2);
    assert.deepEqual(JSON.parse(invalid.stdout).error.kind, 'operational');
  },
);
console.log('Built FP exports and all CLI commands passed smoke checks.');
