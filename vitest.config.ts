import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.ts'],
    maxWorkers: 2,
    restoreMocks: true,
    testTimeout: 30000,
  },
});
