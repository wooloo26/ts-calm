import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeWorkspace } from '#check/workspace.b';

describe('pnpm + Turbo template', () => {
  it('creates a private workspace with public package edges and native imports', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-calm-template-test-'));
    try {
      const result = await initializeWorkspace(root);
      expect(result.created).toContain('turbo.json');
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      expect(manifest.private).toBe(true);
      expect(manifest.devDependencies.turbo).toBeDefined();
      const app = JSON.parse(readFileSync(join(root, 'apps/app/package.json'), 'utf8'));
      expect(app.dependencies['@workspace/shared']).toBe('workspace:*');
      expect(app.imports['#src/*']).toBeDefined();
      expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('packages/*');
      const before = readdirSync(root);
      await expect(initializeWorkspace(root)).rejects.toThrow('empty');
      expect(readdirSync(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
