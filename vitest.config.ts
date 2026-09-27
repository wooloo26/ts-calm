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
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 90,
        lines: 85,
        'packages/check/src/rules/allow.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'packages/check/src/rules/function-params.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});
