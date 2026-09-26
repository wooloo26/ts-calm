import { defineConfig } from '@ts-calm/check';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'template', 'docs', 'build'] } },
  effectImports: ['oxc-resolver', 'oxfmt'],
});
