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
      // Floors just under the measured values of this suite. The command-line entry points and the
      // packaged-install paths are proved by `test:package` and `test:template`, which write their
      // own reports, so this unit report understates them.
      thresholds: { statements: 75, branches: 75, functions: 87, lines: 77 },
    },
  },
});
