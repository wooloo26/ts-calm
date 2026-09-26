import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    testTimeout: 30000,
    benchmark: {
      include: ['packages/*/benchmarks/**/*.bench.ts'],
    },
  },
});
