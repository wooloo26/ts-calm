import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['tests/**/*.ts', '!tests/fixtures/**'],
    maxWorkers: 2,
    restoreMocks: true,
    testTimeout: 30000,
  },
});
