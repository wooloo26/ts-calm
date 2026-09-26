import { defineConfig } from '@ts-calm/check';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'template', 'docs', 'build'] } },
  ignores: ['packages/check/types/**'],
  effectImports: ['oxc-resolver', 'oxfmt'],
});
