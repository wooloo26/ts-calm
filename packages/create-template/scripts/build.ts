import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRootFileTable } from '../src/workspace-files.b.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const repository = fileURLToPath(new URL('../../..', import.meta.url));
const load = createRequire(import.meta.url);
rmSync(join(root, 'dist'), { recursive: true, force: true });

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
if (result.status !== 0) process.exit(result.status ?? 1);

// The template renders this repository's own files, so an installed package ships copies of them.
const shipped = join(root, 'dist', 'template-files');
mkdirSync(shipped, { recursive: true });
for (const file of workspaceRootFileTable)
  cpSync(join(repository, file.path), join(shipped, file.shipped));
