import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['ts-calm-source'] },
  ssr: { resolve: { conditions: ['ts-calm-source'] } },
  test: {
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
});
