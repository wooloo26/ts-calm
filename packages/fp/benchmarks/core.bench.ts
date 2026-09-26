import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BenchResult } from 'vitest';
import { all, ok, traverse } from '@ts-calm/fp';

const values = Array.from({ length: 1000 }, (_, index) => index);
const results = values.map((value) => ok(value));

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
test('collections', async ({ bench }) => {
  const measured = await bench.compare(
    bench('all: 1000 results', () => {
      all(results);
    }),
    bench('traverse: 1000 values', () => {
      traverse(values, (value) => ok(value + 1));
    }),
    { time: 300, warmupTime: 100 },
  );
  save('collections', [measured.get('all: 1000 results'), measured.get('traverse: 1000 values')]);
});
