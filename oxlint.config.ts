import preset from '@ts-calm/check/oxlint';

/**
 * Repository lint configuration: the published preset plus the paths this monorepo keeps out of
 * scope. Generated build output is ignored instead of being added to the repository ignore file.
 */
export default {
  ...preset,
  ignorePatterns: [
    ...(preset.ignorePatterns ?? []),
    '.local/**',
    '.turbo/**',
    'packages/check/types/**',
  ],
};
