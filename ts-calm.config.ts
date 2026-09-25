import { defineConfig } from './src/check/index.ts';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'docs', 'build'] } },
  effectImports: ['oxc-resolver'],
});
