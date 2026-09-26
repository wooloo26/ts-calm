import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundledTemplateOptions,
  initializeWorkspace,
  workspaceTemplate,
} from '@ts-calm/create-template';
import { packageManagerVersion, toolchainVersions } from '../src/toolchain.ts';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const manifest = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repository, path), 'utf8'));

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

  it('pins the versions it was published with', () => {
    for (const value of Object.values(bundledTemplateOptions()))
      expect(value).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps the pinned toolchain identical to the manifests that own it', () => {
    const root = manifest('package.json');
    const check = manifest('packages/check/package.json');
    const fp = manifest('packages/fp/package.json');
    const dependencies = check['dependencies'] as Record<string, string>;
    const rootDev = root['devDependencies'] as Record<string, string>;
    expect(toolchainVersions.fp).toBe(fp['version']);
    expect(toolchainVersions.check).toBe(check['version']);
    expect(toolchainVersions.typescript).toBe(dependencies['typescript']);
    expect(toolchainVersions.oxfmt).toBe(rootDev['oxfmt']);
    expect(toolchainVersions.oxlint).toBe(rootDev['oxlint']);
    expect(toolchainVersions.oxlintTsgolint).toBe(rootDev['oxlint-tsgolint']);
    expect(toolchainVersions.turbo).toBe(rootDev['turbo']);
    expect(toolchainVersions.vitest).toBe(rootDev['vitest']);
    expect(packageManagerVersion).toBe(root['packageManager']);
  });

  it('keeps the published packages free of the formatter and the linter', () => {
    const forbidden = ['oxfmt', 'oxlint', 'oxlint-tsgolint'];
    for (const name of ['fp', 'check', 'create-template']) {
      const manifest_ = manifest(`packages/${name}/package.json`);
      const sections = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;
      for (const section of sections) {
        const entries = manifest_[section] as Record<string, string> | undefined;
        const declared = Object.keys(entries ?? {});
        for (const tool of forbidden) expect(declared, `${name} ${section}`).not.toContain(tool);
      }
    }
  });

  it('depends on nothing at runtime', () => {
    expect(manifest('packages/create-template/package.json')['dependencies']).toBeUndefined();
  });

  it('renders every JSON manifest as valid JSON', () => {
    for (const file of workspaceTemplate(bundledTemplateOptions())) {
      if (!file.path.endsWith('.json')) continue;
      expect(() => JSON.parse(file.content), file.path).not.toThrow();
    }
  });

  it('generates a runnable Vitest project list and a root compiler project', () => {
    const files = new Map(
      workspaceTemplate(bundledTemplateOptions()).map((f) => [f.path, f.content]),
    );
    expect(files.has('vitest.workspace.ts')).toBe(false);
    expect(files.get('vitest.config.ts')).toContain('projects:');
    expect(files.get('vitest.config.ts')).not.toContain('defineWorkspace');
    const tsconfig = JSON.parse(files.get('tsconfig.json') ?? '{}');
    expect(tsconfig.compilerOptions.customConditions).toEqual(['source']);
    expect(tsconfig.include).toEqual([
      '*.ts',
      'packages/*/src/**/*.ts',
      'packages/*/tests/**/*.ts',
    ]);
    const root = JSON.parse(files.get('package.json') ?? '{}');
    expect(root.scripts.typecheck).toContain('tsc --noEmit -p tsconfig.json');
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
