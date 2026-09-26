import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    // Stryker 10's nested-name filtering predates Vitest 5's " > " separator.
    include: ['packages/fp/tests/nullable.ts', 'packages/check/tests/commit-format.ts'],
    maxWorkers: 1,
  },
});
