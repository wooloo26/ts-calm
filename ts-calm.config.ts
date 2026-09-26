import { defineConfig } from '@ts-calm/check';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'docs', 'build'] } },
  effectImports: ['oxc-resolver'],
});
