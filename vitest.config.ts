import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['ts-calm-source'] },
  ssr: { resolve: { conditions: ['ts-calm-source'] } },
  test: {
    include: ['tests/**/*.ts'],
    maxWorkers: 2,
    restoreMocks: true,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportsDirectory: '.local/reports/coverage',
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
});
