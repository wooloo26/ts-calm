import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const run = (cwd: string, command: string, args: readonly string[]): string => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
};

const source = `/**
 * @boundary Read host version for the sample runtime information API.
 * @effects process
 */
import {ok, get, map, isArray, isObject, isPlainObject, hasOwn, traverseAsync} from 'ts-calm';
import {capture} from 'ts-calm/boundary';
export const value = get(map(ok(3), n => n + 1));
export const host = () => process.version;
export const array = (input:unknown) => isArray(input) ? input.length : 0;
export const object = (input:unknown) => isObject(input);
export const plain = (input:unknown) => isPlainObject(input);
export const name = (input:unknown) => hasOwn(input,'name') && typeof input.name === 'string';
export const safe = () => capture(() => 3, {name:'sample'});
export const visit = () => traverseAsync([1,2], n => ok(n * 2));
`;
const types = `import {get, ok, isArray, hasOwn} from 'ts-calm';
const value: number = get(ok(3));
const input:unknown = [1];
if(isArray(input)) {
  // @ts-expect-error values have not been validated as numbers
  const numbers:readonly number[] = input;
  void numbers;
}
if(hasOwn(input,'name')) {
  // @ts-expect-error property presence does not validate its payload
  const name:string = input.name;
  void name;
}
void value;
`;
const runtime = `import assert from 'node:assert/strict';
import {ok,get,map,isOk,isErr,isArray,isPlainObject,hasOwn,traverseAsync} from 'ts-calm';
import {capture,captureAsync} from 'ts-calm/boundary';
import {runChecks,validateCommitMessage,checkProject} from 'ts-calm/check';
assert.equal(get(map(ok(3),n=>n+1)),4);
assert.equal(isErr(capture(()=>{throw Error('external')},{name:'read'})),true);
assert.equal(get(await captureAsync(async()=>7,{name:'read'})),7);
assert.equal(isOk(capture(()=>3,{name:'read'})),true);
assert.equal(isArray([1]),true);
assert.equal(isPlainObject({}),true);
assert.equal(hasOwn({x:1},'x'),true);
const values=await traverseAsync([1,2],n=>ok(n*2));
assert.deepEqual(isOk(values)&&get(values),[2,4]);
assert.deepEqual(validateCommitMessage('feat(fp): consume installed package'),[]);
assert.equal(runChecks({files:[{path:'src/value.ts',content:'export const value=null;'}]})[0].rule,'strict-fp/no-null');
assert.deepEqual(checkProject(process.cwd()),[]);
`;

export const checkConsumer = (
  tarball: string,
  npmCli: string,
  pnpmCli: string,
  manager: 'npm' | 'pnpm',
): void => {
  const consumer = mkdtempSync(join(tmpdir(), `ts-calm-${manager}-`));
  try {
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        private: true,
        dependencies: { 'ts-calm': `file:${tarball.replaceAll('\\', '/')}` },
      }),
    );
    if (manager === 'npm')
      run(consumer, process.execPath, [
        npmCli,
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ]);
    else if (/\.[cm]?js$/.test(pnpmCli))
      run(consumer, process.execPath, [pnpmCli, 'install', '--ignore-scripts']);
    else run(consumer, pnpmCli, ['install', '--ignore-scripts']);
    const cli = join(consumer, 'node_modules/ts-calm/dist/check/cli.b.js');
    run(consumer, process.execPath, [cli, 'init']);
    const configs = ['package.json', 'tsconfig.json', 'oxlint.config.ts', 'oxfmt.config.ts'];
    const before = configs.map((path) => readFileSync(join(consumer, path), 'utf8'));
    run(consumer, process.execPath, [cli, 'init']);
    if (configs.some((path, index) => readFileSync(join(consumer, path), 'utf8') !== before[index]))
      throw new Error('init is not idempotent.');
    mkdirSync(join(consumer, 'src'));
    mkdirSync(join(consumer, 'tests'));
    writeFileSync(join(consumer, 'src/main.b.ts'), source);
    writeFileSync(join(consumer, 'tests/types.ts'), types);
    writeFileSync(join(consumer, 'runtime.mjs'), runtime);
    run(consumer, process.execPath, [cli, 'fmt']);
    run(consumer, process.execPath, [cli, 'check']);
    run(consumer, process.execPath, [cli, 'lint']);
    run(consumer, process.execPath, [cli, 'typecheck']);
    run(consumer, process.execPath, ['runtime.mjs']);
    const explanation = run(consumer, process.execPath, [cli, 'explain', 'strict-fp/no-try']);
    if (!explanation.includes('captureAsync')) throw new Error('Missing functional guidance.');
    run(consumer, process.execPath, [npmCli, 'exec', '--offline', '--', 'ts-calm', 'check']);
    const rootOnly = run(consumer, process.execPath, [
      '--input-type=module',
      '-e',
      'import {registerHooks} from "node:module"; registerHooks({resolve(s,c,next){if(s.startsWith("node:")||s.startsWith("oxc-")||s.startsWith("oxlint"))throw Error("Unexpected tool dependency: "+s);return next(s,c)}}); const {ok,get}=await import("ts-calm"); console.log(get(ok(1)))',
    ]);
    if (rootOnly.trim() !== '1') throw new Error('Root entry is not independent.');
    console.log(`${manager}: isolated install, init, Node types, check, CLI and runtime passed.`);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
};
