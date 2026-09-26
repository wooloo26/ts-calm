import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['packages/*/tests/**/*.ts', '!packages/*/tests/fixtures/**'],
    maxWorkers: 2,
    restoreMocks: true,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      reportsDirectory: '.local/reports/coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
});
