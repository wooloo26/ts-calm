import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BenchResult } from 'vitest';
import { runChecks } from '@ts-calm/check';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { callGraph } from '../tests/fixtures/graphs.ts';

const files = Array.from({ length: 100 }, (_, index) => ({
  path: `src/module-${index}/value.ts`,
  content: `export const value${index} = (input: number): number => input + ${index};`,
}));

const save = (name: string, data: readonly BenchResult[]): void => {
  mkdirSync('.local/reports/bench', { recursive: true });
  writeFileSync(
    `.local/reports/bench/${name}.json`,
    JSON.stringify(
      { node: process.version, platform: process.platform, results: data },
      (key, value: unknown) => (key === 'samples' ? undefined : value),
      2,
    ),
  );
};
test('source analysis', async ({ bench }) => {
  const scenarios = [
    { name: '100 independent modules including purity', files },
    ...(['chain', 'diamond', 'fanout'] as const).map((kind) => ({
      name: `${kind} call graph`,
      files: [
        {
          path: 'src/graph.ts',
          content: callGraph(kind, kind === 'chain' ? 48 : kind === 'diamond' ? 12 : 18),
        },
      ],
    })),
  ];
  const measured: BenchResult[] = [];
  for (const scenario of scenarios) {
    expect(runChecks({ files: scenario.files })).toEqual([]);
    measured.push(
      await bench(scenario.name, () => {
        runChecks({ files: scenario.files });
      }).run({ time: 300, warmupTime: 100 }),
    );
  }
  save('source-analysis', measured);
});

test('cold repository analysis', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const cli = fileURLToPath(new URL('../src/cli.b.ts', import.meta.url));
  const start = performance.now();
  const result = spawnSync(process.execPath, ['--conditions=source', cli, 'check', '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  });
  const durationMs = performance.now() - start;
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  mkdirSync('.local/reports/bench', { recursive: true });
  writeFileSync(
    '.local/reports/bench/cold-analysis.json',
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        durationMs,
        diagnostics: JSON.parse(result.stdout),
      },
      undefined,
      2,
    ),
  );
});
