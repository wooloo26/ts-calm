import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isArray, hasOwn } from '#fp/guards';
import { checkConsumer, run } from '#scripts/consumer';
import { parseSync } from 'oxc-parser';

const root = fileURLToPath(new URL('..', import.meta.url));
const release = join(root, '.local/release');
mkdirSync(release, { recursive: true });
const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
const pnpmCli = process.env['npm_execpath'];
if (!npmCli || !pnpmCli)
  throw new Error('Run this check through pnpm with npm available beside Node.');

run(root, process.execPath, [npmCli, 'pack', '--pack-destination', release, '--json']);
const tarball = join(release, 'ts-calm-0.1.0.tgz');
const listing: unknown = JSON.parse(
  run(root, process.execPath, [npmCli, 'pack', '--dry-run', '--ignore-scripts', '--json']),
);
const manifest = isArray(listing) ? listing[0] : {};
if (!hasOwn(manifest, 'files') || !isArray(manifest.files))
  throw new Error('npm pack did not return a file manifest.');
const files = manifest.files.map((file) =>
  hasOwn(file, 'path') && typeof file.path === 'string' ? file.path : '',
);
const allowed = [
  'package.json',
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
  '.oxlintrc.json',
  '.oxfmtrc.json',
];
if (files.some((path) => !/^(dist|presets|types|docs)\//.test(path) && !allowed.includes(path)))
  throw new Error(`Unexpected packed content: ${files.join(', ')}`);
for (const path of files) {
  const content = readFileSync(join(root, path), 'utf8');
  if (content.includes('@local-tx-one-piece'))
    throw new Error(`Unpublished workspace dependency in ${path}`);
  if (path.startsWith('dist/') && /\.(?:js|ts)$/.test(path)) {
    const module = parseSync(path, content).module;
    const imports = [
      ...module.staticImports.map((entry) => entry.moduleRequest.value),
      ...module.staticExports.flatMap((group) =>
        group.entries.flatMap((entry) => (entry.moduleRequest ? [entry.moduleRequest.value] : [])),
      ),
    ];
    if (imports.some((name) => /^#(?:tests|fixtures|scripts)\//.test(name)))
      throw new Error(`Development-only import in ${path}`);
  }
}
for (const manager of ['npm', 'pnpm'] as const) checkConsumer(tarball, npmCli, pnpmCli, manager);
writeFileSync(
  join(release, 'package-check.json'),
  JSON.stringify(
    {
      tarball,
      files,
      installers: ['npm', 'pnpm'],
      checks: [
        'published exports',
        'type declarations',
        'init idempotence',
        'bundled Node types',
        'all static tools',
        'CLI',
        'independent functional entry',
      ],
    },
    null,
    2,
  ),
);
console.log(`Package smoke passed: ${tarball}`);
