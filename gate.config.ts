import { defineConfig } from './src/gates/index.ts';

export default defineConfig({
  rules: { 'commit-message': { scopes: ['root', 'fp', 'gates', 'docs', 'build'] } },
  effectImports: ['oxc-resolver'],
});
