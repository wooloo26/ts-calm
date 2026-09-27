import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Diagnostic } from '@ts-calm/check';

it('keeps the repository free of rule errors and length warnings, with reviewed purity limits', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const cli = fileURLToPath(new URL('../src/cli.b.ts', import.meta.url));
  // Native configuration modules must not be mixed with Vitest-transformed modules in one V8 isolate.
  const result = spawnSync(process.execPath, ['--conditions=source', cli, 'check', '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const diagnostics: Diagnostic[] = JSON.parse(result.stdout);
  expect(
    diagnostics.every(
      (value) => value.rule === 'purity/incomplete' && value.severity === 'warning',
    ),
  ).toBe(true);
  const actual = diagnostics.map((value) => ({
    file: value.file,
    functions: value.help?.replace('Incomplete functions: ', '').split(', ') ?? [],
  }));
  const expected = JSON.parse(
    readFileSync(new URL('fixtures/purity-baseline.json', import.meta.url), 'utf8'),
  );
  expect(actual).toEqual(expected);
});
