import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const release = join(root, '.local', 'release');
mkdirSync(release, { recursive: true });
const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npmCli) throw new Error('Cannot locate the npm CLI beside this Node installation.');

const run = (cwd: string, command: string, args: readonly string[]): string => {
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

run(root, process.execPath, [npmCli, 'pack', '--pack-destination', release, '--json']);
const tarball = join(release, 'fp-gates-0.1.0.tgz');
const listing: unknown = JSON.parse(
  run(root, process.execPath, [npmCli, 'pack', '--dry-run', '--ignore-scripts', '--json']),
);
if (!Array.isArray(listing)) throw new Error('npm pack did not return a manifest.');
const manifest = listing[0];
const files: string[] = manifest.files.map((file: { path: string }) => file.path);
if (
  files.some(
    (path) =>
      !path.startsWith('dist/') &&
      !['package.json', 'LICENSE', 'README.md', 'README.zh-CN.md'].includes(path),
  )
)
  throw new Error(`Unexpected packed content: ${files.join(', ')}`);
for (const path of files.filter((path) => path.startsWith('dist/'))) {
  const content = readFileSync(join(root, path), 'utf8');
  if (
    content.includes('@local-tx-one-piece') ||
    /(?:from\s*|import\s*)["']#(?:src|fixtures)/.test(content)
  )
    throw new Error(`Unpublished workspace dependency in ${path}`);
}

const consumer = mkdtempSync(join(tmpdir(), 'fp-gates-consumer-'));
try {
  writeFileSync(
    join(consumer, 'package.json'),
    '{"name":"fp-gates-consumer","private":true,"type":"module"}',
  );
  run(consumer, process.execPath, [
    npmCli,
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    tarball,
  ]);
  writeFileSync(
    join(consumer, 'runtime.mjs'),
    `
import assert from 'node:assert/strict';
import {ok, get, map, isErr, isOk} from 'fp-gates';
import {capture, captureAsync} from 'fp-gates/boundary';
import {runGates, validateCommitMessage, checkProject} from 'fp-gates/gates';
assert.equal(get(map(ok(3), n => n + 1)), 4);
assert.equal(isErr(capture(() => {throw Error('external')}, {name:'read'})), true);
assert.equal(get(await captureAsync(async () => 7, {name:'read'})), 7);
assert.equal(isOk(capture(() => 3, {name:'read'})), true);
assert.deepEqual(validateCommitMessage('feat(fp): consume installed package'), []);
assert.equal(runGates({files:[{path:'src/value.ts',content:'export const value=null;'}]})[0].rule, 'strict-fp/no-null');
assert.deepEqual(checkProject(process.cwd()), []);
`,
  );
  writeFileSync(
    join(consumer, 'consumer.ts'),
    `
import {ok, map, get} from 'fp-gates';
import type {Result} from 'fp-gates';
import {capture} from 'fp-gates/boundary';
import {defineConfig} from 'fp-gates/gates';
const result: Result<number, never> = map(ok(3), value => value + 1);
const exact: number = get(ok(3));
capture(() => exact, {name:'read'});
defineConfig({rules:{'strict-fp':{'no-null':false}}});
// @ts-expect-error successful payload is numeric, not string
const wrong: string = get(ok(3));
void result; void wrong;
`,
  );
  writeFileSync(join(consumer, 'gate.config.ts'), 'export default {ignores:["consumer.ts"]};');
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        target: 'ES2024',
        skipLibCheck: true,
        noEmit: true,
      },
      files: ['consumer.ts'],
    }),
  );
  run(consumer, process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(consumer, 'tsconfig.json'),
  ]);
  run(consumer, process.execPath, ['runtime.mjs']);
  const cli = join(consumer, 'node_modules/fp-gates/dist/gates/cli.b.js');
  run(consumer, process.execPath, [cli, 'check']);
  run(consumer, process.execPath, [npmCli, 'exec', '--offline', '--', 'fp-gates', 'check']);
  const nodeOnly = run(consumer, process.execPath, [
    '--input-type=module',
    '-e',
    'import {registerHooks} from "node:module"; registerHooks({resolve(s,c,next){if(s.startsWith("node:")||s.startsWith("oxc-"))throw Error("Unexpected gate dependency: "+s);return next(s,c)}}); const {ok,get}=await import("fp-gates"); console.log(get(ok(1)))',
  ]);
  if (nodeOnly.trim() !== '1') throw new Error('Root entry failed.');
  writeFileSync(
    join(release, 'package-check.json'),
    JSON.stringify(
      {
        tarball,
        files,
        checks: [
          'published exports',
          'type declarations',
          'CLI',
          'independent consumer',
          'workspace isolation',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Package smoke passed: ${tarball}`);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
