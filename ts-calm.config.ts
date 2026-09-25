import { defineConfig } from '#check/index';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'check', 'docs', 'build'] } },
  effectImports: ['oxc-resolver'],
});
