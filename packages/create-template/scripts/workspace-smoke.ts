import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledTemplateOptions, initializeWorkspace } from '@ts-calm/create-template';
import { run } from '../../check/scripts/consumer.ts';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const release = join(repository, '.local/release');
const pnpmCli = process.env['npm_execpath'];
if (!pnpmCli) throw new Error('Run this check through pnpm.');

const tarball = (packageName: string): string => {
  const prefix = `${packageName}-`;
  const file = existsSync(release)
    ? readdirSync(release)
        .filter((name) => name.startsWith(prefix) && name.endsWith('.tgz'))
        .sort()
        .at(-1)
    : undefined;
  if (!file) throw new Error(`Run pnpm test:package before pnpm test:template (${packageName}).`);
  return join(release, file);
};
const fpTarball = tarball('ts-calm-fp');
const checkTarball = tarball('ts-calm-check');
const templateTarball = tarball('ts-calm-create-template');
const root = mkdtempSync(join(tmpdir(), 'ts-calm-workspace-'));
const runIn = (directory: string, args: readonly string[]): string =>
  /\.[cm]?js$/.test(pnpmCli)
    ? run(directory, process.execPath, [pnpmCli, ...args])
    : run(directory, pnpmCli, args);
const command = (args: readonly string[]): string => runIn(root, args);

const proveIsolatedGeneration = (): void => {
  const isolated = mkdtempSync(join(tmpdir(), 'ts-calm-template-isolated-'));
  try {
    writeFileSync(
      join(isolated, 'package.json'),
      JSON.stringify(
        {
          name: 'template-probe',
          private: true,
          type: 'module',
          dependencies: { '@ts-calm/create-template': fileSpec(templateTarball) },
        },
        undefined,
        2,
      ) + '\n',
    );
    runIn(isolated, ['install', '--ignore-scripts']);
    const printed = run(isolated, process.execPath, [
      '--input-type=module',
      '-e',
      'const {initializeWorkspace}=await import("@ts-calm/create-template");const result=await initializeWorkspace("./rendered");console.log(result.created.length);',
    ]);
    if (Number(printed.trim()) < 10)
      throw new Error(`The packed template rendered ${printed.trim()} files.`);
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
};
const latestSummary = (): unknown => {
  const directory = join(root, '.turbo/runs');
  const file = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .at(-1);
  if (!file) throw new Error('Turbo did not emit its run summary.');
  return JSON.parse(readFileSync(join(directory, file), 'utf8'));
};
const cacheStates = (summary: unknown): readonly string[] => {
  const tasks = (summary as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task: unknown) => {
    const cache = (task as { cache?: unknown }).cache;
    const status =
      typeof cache === 'object' && cache !== null ? (cache as { status?: unknown }).status : '';
    return typeof status === 'string' ? status : 'unknown';
  });
};
const fileSpec = (path: string): string => `file:${path.replaceAll('\\', '/')}`;

try {
  await initializeWorkspace(root);
  const versions = bundledTemplateOptions();
  for (const path of ['package.json', 'packages/a/package.json', 'packages/b/package.json']) {
    const full = join(root, path),
      manifest = JSON.parse(readFileSync(full, 'utf8'));
    for (const section of ['dependencies', 'devDependencies']) {
      if (!manifest[section]) continue;
      for (const [name, range] of Object.entries(manifest[section])) {
        if (name === '@ts-calm/fp' && range === versions.fpVersion)
          manifest[section][name] = fileSpec(fpTarball);
        if (name === '@ts-calm/check' && range === versions.checkVersion)
          manifest[section][name] = fileSpec(checkTarball);
      }
    }
    writeFileSync(full, JSON.stringify(manifest, null, 2) + '\n');
  }
  command(['install', '--ignore-scripts']);
  command(['fmt']);
  command(['fmt:check']);
  command(['lint']);
  command(['build']);
  command(['typecheck']);
  command(['check']);
  command(['test']);
  command(['exec', 'turbo', 'run', 'build', '--summarize']);
  const cached = cacheStates(latestSummary());
  if (cached.length !== 2 || cached.some((value) => value !== 'HIT'))
    throw new Error(`Expected two cached builds, got ${cached.join(', ')}.`);
  const dependency = join(root, 'packages/a/src/value.ts');
  writeFileSync(
    dependency,
    `${readFileSync(dependency, 'utf8')}\n// A dependent package must rebuild after this change.\n`,
  );
  command(['exec', 'turbo', 'run', 'build', '--summarize']);
  const invalidated = cacheStates(latestSummary());
  if (invalidated.some((value) => value === 'HIT'))
    throw new Error('A dependency source change did not invalidate its dependent build.');
  for (const directory of ['packages/a', 'packages/b'])
    renameSync(join(root, directory, 'src'), join(root, directory, 'source.saved'));
  writeFileSync(
    join(root, 'packages/b/run.mjs'),
    "import { greet } from '@workspace/b';\nconsole.log(greet('reader'));\n",
  );
  const started = run(join(root, 'packages/b'), process.execPath, ['run.mjs']);
  if (!started.includes('Hello, reader!'))
    throw new Error('Built output depends on source files or a stale cache.');
  proveIsolatedGeneration();
  writeFileSync(
    join(release, 'template-check.json'),
    JSON.stringify(
      {
        template: 'pnpm-turbo',
        checks: [
          'install',
          'fmt normalizes a fresh tree',
          'fmt:check clean after fmt',
          'lint',
          'build',
          'typecheck',
          'check',
          'test',
          'run',
          'cache hit',
          'dependency invalidation',
          'run without source',
          'isolated generation without a toolchain',
        ],
        cached,
        invalidated,
      },
      null,
      2,
    ),
  );
  console.log(
    'Workspace template: install, every command, isolated generation, cache invalidation and source-free execution passed.',
  );
} finally {
  if (process.env['TS_CALM_KEEP_WORKSPACE'] === '1') console.log(`Kept workspace at ${root}.`);
  else rmSync(root, { recursive: true, force: true });
}
