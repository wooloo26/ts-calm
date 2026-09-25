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
import { initializeWorkspace } from '#check/workspace.b';
import { run } from '#scripts/consumer';
import { isArray, hasOwn } from '#fp/guards';

const repository = fileURLToPath(new URL('..', import.meta.url));
const tarball = join(repository, '.local/release/ts-calm-0.1.0.tgz');
const pnpmCli = process.env['npm_execpath'];
if (!pnpmCli || !existsSync(tarball))
  throw new Error('Run pnpm test:package before pnpm test:template.');
const root = mkdtempSync(join(tmpdir(), 'ts-calm-workspace-'));
const command = (args: readonly string[]): string =>
  /\.[cm]?js$/.test(pnpmCli)
    ? run(root, process.execPath, [pnpmCli, ...args])
    : run(root, pnpmCli, args);
const latestSummary = (): unknown => {
  const directory = join(root, '.turbo/runs');
  const file = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .at(-1);
  if (!file) throw new Error('Turbo did not emit its run summary.');
  return JSON.parse(readFileSync(join(directory, file), 'utf8'));
};
const cacheStates = (summary: unknown): readonly string[] =>
  hasOwn(summary, 'tasks') && isArray(summary.tasks)
    ? summary.tasks.map((task) =>
        hasOwn(task, 'cache') &&
        hasOwn(task.cache, 'status') &&
        typeof task.cache.status === 'string'
          ? task.cache.status
          : 'unknown',
      )
    : [];

try {
  await initializeWorkspace(root);
  for (const path of ['package.json', 'apps/app/package.json', 'packages/shared/package.json']) {
    const full = join(root, path),
      manifest = JSON.parse(readFileSync(full, 'utf8'));
    for (const section of ['dependencies', 'devDependencies'])
      if (manifest[section]?.['ts-calm'])
        manifest[section]['ts-calm'] = `file:${tarball.replaceAll('\\', '/')}`;
    writeFileSync(full, JSON.stringify(manifest, null, 2) + '\n');
  }
  command(['install', '--ignore-scripts']);
  command(['fmt']);
  command(['build']);
  command(['check']);
  command(['test']);
  const started = command(['start']);
  if (!started.includes('Hello, world!'))
    throw new Error('Generated app did not run its shared package.');
  command(['exec', 'turbo', 'run', 'build', '--summarize']);
  const cached = cacheStates(latestSummary());
  if (cached.length !== 2 || cached.some((value) => value !== 'HIT'))
    throw new Error(`Expected two cached builds, got ${cached.join(', ')}.`);
  const shared = join(root, 'packages/shared/src/greet.ts');
  writeFileSync(shared, readFileSync(shared, 'utf8').replace('Hello,', 'Hi,'));
  command(['exec', 'turbo', 'run', 'build', '--summarize']);
  const invalidated = cacheStates(latestSummary());
  if (invalidated.some((value) => value === 'HIT'))
    throw new Error('A shared source change did not invalidate its dependent build.');
  for (const directory of ['apps/app', 'packages/shared'])
    renameSync(join(root, directory, 'src'), join(root, directory, 'source.saved'));
  if (!command(['start']).includes('Hi, world!'))
    throw new Error('Built output depends on source files or stale cache.');
  writeFileSync(
    join(repository, '.local/release/template-check.json'),
    JSON.stringify(
      {
        template: 'pnpm-turbo',
        checks: [
          'install',
          'build',
          'check',
          'test',
          'start',
          'cache hit',
          'dependency invalidation',
          'run without source',
        ],
        cached,
        invalidated,
      },
      null,
      2,
    ),
  );
  console.log(
    'Workspace template: all commands, cache invalidation and source-free execution passed.',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
