import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['ts-calm-source'] },
  ssr: { resolve: { conditions: ['ts-calm-source'] } },
  test: {
    // Stryker 10's nested-name filtering predates Vitest 5's " > " separator.
    include: ['tests/fp/nullable.ts', 'tests/check/commit-format.ts'],
    maxWorkers: 1,
  },
});
