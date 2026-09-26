import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
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
process.exitCode = result.status ?? 1;
