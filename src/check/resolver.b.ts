/**
 * @boundary Resolve imports against the inspected filesystem and report unresolved dependencies explicitly.
 * @effects node:fs
 * @effects oxc-resolver
 * @allow strict-fp/no-try -- Malformed package metadata or resolver failures become resolution diagnostics.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ResolverFactory } from 'oxc-resolver';
import { classifyTarget } from './resolution.ts';
import type { AnalyzedFile, ResolvedImport } from './types.ts';

const packageName = (path: string): string => {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof data === 'object' && data && 'name' in data && typeof data.name === 'string')
    return data.name;
  return '';
};

const packageAliases = (root: string, files: readonly string[]): Record<string, string[]> => {
  const aliases: Record<string, string[]> = {};
  for (const path of files.filter((file) => /(?:^|\/)package\.json$/.test(file))) {
    const name = packageName(join(root, path));
    if (name) aliases[name] = [dirname(join(root, path))];
  }
  return aliases;
};

export const resolveImports = (
  root: string,
  analyzed: readonly AnalyzedFile[],
  allPaths: readonly string[],
): readonly ResolvedImport[] => {
  const owned = new Set(analyzed.map((file) => file.source.path));
  const aliases = packageAliases(root, allPaths);
  const resolver = new ResolverFactory({
    tsconfig: 'auto',
    builtinModules: true,
    conditionNames: ['source', 'import', 'node', 'default'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    allowPackageExportsInDirectoryResolve: true,
  });
  const result: ResolvedImport[] = [];
  const typeResolver = resolver.cloneWithOptions({
    tsconfig: 'auto',
    builtinModules: true,
    conditionNames: ['source', 'types', 'import', 'node', 'default'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.d.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    allowPackageExportsInDirectoryResolve: true,
  });
  for (const { source, parsed } of analyzed)
    for (const imported of parsed.imports) {
      try {
        const owner = Object.keys(aliases).find(
          (name) => imported.specifier === name || imported.specifier.startsWith(`${name}/`),
        );
        const origin = owner
          ? join(aliases[owner]?.[0] ?? root, 'package.json')
          : resolve(root, source.path);
        const resolved = (imported.typeOnly ? typeResolver : resolver).resolveFileSync(
          origin,
          imported.specifier,
        );
        if (resolved.builtin) {
          result.push({ file: source.path, imported, target: { kind: 'external' } });
          continue;
        }
        if (!resolved.path) {
          result.push({
            file: source.path,
            imported,
            target: {
              kind: 'error',
              message: `Cannot resolve ${imported.specifier}: ${resolved.error ?? 'no target'}`,
            },
          });
          continue;
        }
        result.push({
          file: source.path,
          imported,
          target: classifyTarget(root, owned, imported.specifier, resolved.path),
        });
      } catch (cause) {
        result.push({
          file: source.path,
          imported,
          target: {
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Resolver failed.',
          },
        });
      }
    }
  return result;
};

export const hasInstalledDependencies = (root: string): boolean =>
  existsSync(join(root, 'node_modules'));
