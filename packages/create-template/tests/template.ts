import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundledTemplateOptions,
  initializeWorkspace,
  workspaceTemplate,
} from '@ts-calm/create-template';

describe('pnpm + Turbo template', () => {
  it('renders the same files for the same options', () => {
    const options = {
      fpVersion: '0.1.0',
      checkVersion: '0.1.0',
      compiler: '7.0.2',
      turbo: '2.11.4',
      vitest: '5.0.1',
    } as const;
    expect(workspaceTemplate(options)).toEqual(workspaceTemplate(options));
    expect(workspaceTemplate(options).length).toBeGreaterThan(10);
  });

  it('resolves the versions this package was published with', () => {
    const options = bundledTemplateOptions();
    for (const value of Object.values(options)) expect(value).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps internal imports relative so they also work in browsers', () => {
    const options = bundledTemplateOptions();
    const sources = workspaceTemplate(options).filter(
      (file) => file.path.endsWith('.ts') && !file.path.endsWith('config.ts'),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source.content).not.toMatch(/from '#/);
  });

  it('creates a private workspace with two example packages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-calm-template-test-'));
    try {
      const result = await initializeWorkspace(root);
      expect(result.created).toContain('turbo.json');
      expect(result.updated).toEqual([]);
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      expect(manifest.private).toBe(true);
      expect(manifest.devDependencies.turbo).toBeDefined();
      expect(Object.keys(manifest.devDependencies)).toContain('oxfmt');
      expect(Object.keys(manifest.devDependencies)).toContain('oxlint');
      const a = JSON.parse(readFileSync(join(root, 'packages/a/package.json'), 'utf8'));
      const b = JSON.parse(readFileSync(join(root, 'packages/b/package.json'), 'utf8'));
      expect(a.dependencies['@ts-calm/fp']).toBeDefined();
      expect(b.dependencies['@workspace/a']).toBe('workspace:*');
      expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('packages/*');
      const before = readdirSync(root);
      await expect(initializeWorkspace(root)).rejects.toThrow('empty');
      expect(readdirSync(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
