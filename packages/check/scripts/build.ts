/**
 * @boundary Build the check package and vendor the Node type definitions its preset needs, without a network install.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @allow strict-fp/no-throw -- A missing dependency or failing compiler must stop the build.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = createRequire(import.meta.url);
rmSync(join(root, 'dist'), { recursive: true, force: true });
rmSync(join(root, 'types', 'node'), { recursive: true, force: true });
rmSync(join(root, 'types', 'undici-types'), { recursive: true, force: true });

/** Copy one installed type package into the published `types` directory. */
const vendor = (packageName: string, directory: string): void => {
  const source = dirname(load.resolve(`${packageName}/package.json`));
  if (!statSync(source).isDirectory())
    throw new Error(`Cannot locate the type definitions of ${packageName}.`);
  const target = join(root, 'types', directory);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true });
};

vendor('@types/node', 'node');
vendor('undici-types', 'undici-types');

const result = spawnSync(
  process.execPath,
  [join(dirname(load.resolve('typescript/package.json')), 'bin/tsc'), '-p', 'tsconfig.build.json'],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
