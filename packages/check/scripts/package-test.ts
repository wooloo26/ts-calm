import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { hasOwn, isArray, isString } from '@ts-calm/fp';
import { checkConsumer, run } from './consumer.ts';
import { parseSync } from 'oxc-parser';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const packages = join(repository, 'packages');
const release = join(repository, '.local/release');
const names = ['fp', 'check', 'create-template'] as const;

const npmCli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
const pnpmCli = process.env['npm_execpath'];
if (!npmCli || !pnpmCli)
  throw new Error('Run this check through pnpm with npm available beside Node.');
const npm: string = npmCli;
const pnpm: string = pnpmCli;
for (const name of names)
  if (!existsSync(join(packages, name, 'dist'))) throw new Error(`Build @ts-calm/${name} first.`);
rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });

const manifestOf = (packageName: string): Record<string, unknown> => {
  const data: unknown = JSON.parse(
    readFileSync(join(packages, packageName, 'package.json'), 'utf8'),
  );
  if (typeof data !== 'object' || !data) throw new Error(`Invalid manifest for ${packageName}.`);
  return data as Record<string, unknown>;
};
const versionOf = (packageName: string): string => {
  const version = manifestOf(packageName)['version'];
  if (!isString(version)) throw new Error(`Missing version in ${packageName}.`);
  return version;
};
const fileRange = (file: string): string => `file:${file.replaceAll('\\', '/')}`;
const internalRanges = new Map<string, string>([
  ['@ts-calm/fp', fileRange(join(release, `ts-calm-fp-${versionOf('fp')}.tgz`))],
  [
    '@ts-calm/create-template',
    fileRange(join(release, `ts-calm-create-template-${versionOf('create-template')}.tgz`)),
  ],
]);
const vendored =
  /(?:^|[\\/])(?:node_modules|tests|fixtures|benchmarks|scripts|\.turbo|\.local|tsconfig\.json|tsconfig\.build\.json|vitest\.config\.ts)(?:[\\/]|$)/;
const stage = (packageName: string): string => {
  const source = join(packages, packageName);
  const staging = mkdtempSync(join(tmpdir(), `ts-calm-pack-${packageName}-`));
  cpSync(source, staging, {
    recursive: true,
    filter: (path) => !vendored.test(path.slice(source.length)),
  });
  const manifest = manifestOf(packageName);
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const entries = manifest[section];
    if (typeof entries !== 'object' || !entries) continue;
    for (const [dependency, range] of Object.entries(entries))
      if (
        internalRanges.has(dependency) &&
        isString(range) &&
        range !== internalRanges.get(dependency)
      )
        (entries as Record<string, string>)[dependency] = internalRanges.get(dependency) ?? range;
  }
  writeFileSync(join(staging, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n');
  return staging;
};

const staged: string[] = [];
const tarballs = new Map<string, string>();
try {
  for (const name of names) {
    const staging = stage(name);
    staged.push(staging);
    const output = run(staging, process.execPath, [
      npm,
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      release,
      '--json',
    ]);
    const listing: unknown = JSON.parse(output);
    const entry = isArray(listing) ? listing[0] : {};
    const file = hasOwn(entry, 'filename') && isString(entry.filename) ? entry.filename : '';
    if (!file) throw new Error(`npm pack did not report a tarball for ${name}.`);
    tarballs.set(`@ts-calm/${name}`, join(release, file));
    rmSync(staging, { recursive: true, force: true });
    staged.pop();
  }
} finally {
  for (const staging of staged) rmSync(staging, { recursive: true, force: true });
}

const checkPackage = join(packages, 'check');
const dryRun = run(checkPackage, process.execPath, [
  npm,
  'pack',
  '--dry-run',
  '--ignore-scripts',
  '--json',
  '--pack-destination',
  release,
]);
const listing: unknown = JSON.parse(dryRun);
const manifest = isArray(listing) ? listing[0] : {};
if (!hasOwn(manifest, 'files') || !isArray(manifest.files))
  throw new Error('npm pack did not return a file manifest.');
const files = manifest.files.map((file) =>
  hasOwn(file, 'path') && isString(file.path) ? file.path : '',
);
const allowed = ['package.json', 'LICENSE', 'README.md'];
const unexpected = files.filter(
  (path) => !/^(dist|presets)\//.test(path) && !allowed.includes(path),
);
if (unexpected.length) throw new Error(`Unexpected packed content: ${unexpected.join(', ')}`);
const checkManifest = manifestOf('check');
const published = new Set([
  ...Object.keys(
    typeof checkManifest['dependencies'] === 'object' && checkManifest['dependencies']
      ? checkManifest['dependencies']
      : {},
  ),
  ...builtinModules,
  '@ts-calm/check',
]);
const packageNameOf = (name: string): string => {
  const parts = name.split('/');
  return name.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? name);
};
const unpublished = (name: string): boolean =>
  !name.startsWith('.') &&
  !name.startsWith('#') &&
  !name.startsWith('node:') &&
  !published.has(packageNameOf(name));
for (const path of files) {
  if (!path.endsWith('.js') && !path.endsWith('.ts')) continue;
  const content = readFileSync(join(checkPackage, path), 'utf8');
  const module = parseSync(path, content).module;
  const imports = [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((group) =>
      group.entries.flatMap((entry) => (entry.moduleRequest ? [entry.moduleRequest.value] : [])),
    ),
  ];
  if (imports.some((name) => /^#(?:tests|fixtures|scripts)\//.test(name)))
    throw new Error(`Development-only import in ${path}`);
  const leaks = imports.filter(unpublished);
  if (leaks.length) throw new Error(`Unpublished dependency ${leaks.join(', ')} in ${path}`);
}

const checkTarball = tarballs.get('@ts-calm/check');
const fpTarball = tarballs.get('@ts-calm/fp');
if (!checkTarball || !fpTarball) throw new Error('The release tarballs were not produced.');
for (const manager of ['npm', 'pnpm'] as const)
  await checkConsumer(fpTarball, checkTarball, npm, pnpm, manager);
writeFileSync(
  join(release, 'package-check.json'),
  JSON.stringify(
    {
      tarballs: [...tarballs.values()],
      installers: ['npm', 'pnpm'],
      checks: [
        'published exports',
        'type declarations',
        'init idempotence',
        'pinned compiler',
        'no published formatter or linter import',
        'CLI',
        'independent functional entry',
      ],
    },
    undefined,
    2,
  ),
);
console.log(`Package smoke passed: ${[...tarballs.keys()].join(', ')}`);
