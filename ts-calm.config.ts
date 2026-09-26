import { defineConfig } from '@ts-calm/check';

/**
 * The repository is one checked project.
 *
 * The configuration lives at the scan root because the check command reads exactly one
 * `ts-calm.config.ts` for the directory it inspects. A configuration inside a package is never
 * loaded, so `commit-message` and `effectImports` stated here apply to every file.
 */
export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'template', 'docs', 'build'] } },
  effectImports: ['oxc-resolver', 'oxfmt'],
});
