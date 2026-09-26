import preset from '@ts-calm/check/oxfmt';

/**
 * Repository formatter configuration: the published preset plus the paths this monorepo must not
 * rewrite. The vendored Node type definitions are copied at build time and stay untouched.
 */
export default {
  ...preset,
  ignorePatterns: [...(preset.ignorePatterns ?? []), 'packages/check/types/**'],
};
