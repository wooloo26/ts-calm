import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hasOwn, isArray } from '#fp/guards';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(
  process.execPath,
  [join(root, 'node_modules/@stryker-mutator/core/bin/stryker.js'), 'run'],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  const report: unknown = JSON.parse(
    readFileSync(join(root, '.local/reports/mutation/report.json'), 'utf8'),
  );
  const files = hasOwn(report, 'files') ? report.files : {};
  const nullable = hasOwn(files, 'src/fp/nullable.b.ts') ? files['src/fp/nullable.b.ts'] : {};
  const mutants = hasOwn(nullable, 'mutants') && isArray(nullable.mutants) ? nullable.mutants : [];
  const canary = mutants.filter(
    (mutant) => hasOwn(mutant, 'replacement') && mutant.replacement === 'true',
  );
  if (
    canary.length === 0 ||
    canary.some((mutant) => !hasOwn(mutant, 'status') || mutant.status !== 'Killed')
  )
    throw new Error(
      'Mutation canary failed: nullable-always-true must be killed. Check runner filtering before trusting the score.',
    );
  console.log('Mutation runner canary passed: the nullable-always-true defect was killed.');
}
