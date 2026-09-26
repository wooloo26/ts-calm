/**
 * @boundary Resolve imports against the inspected filesystem and report unresolved dependencies explicitly.
 * @effects node:fs
 * @effects oxc-resolver
 * @allow strict-fp/no-try -- Malformed package metadata or resolver failures become resolution diagnostics.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ResolverFactory } from 'oxc-resolver';
import { classifyTarget } from '#src/resolution';
import { compilerConditions } from '#src/compiler-options.b';
import type { AnalyzedFile, ResolvedImport } from '#src/types';

/** @impure Read package metadata from disk. */
const packageName = (path: string): string => {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof data === 'object' && data && 'name' in data && typeof data.name === 'string')
    return data.name;
  return '';
};

/** @impure Read workspace package metadata. */
const packageAliases = (
  root: string,
  files: readonly string[],
): Readonly<{ aliases: Record<string, string[]>; directories: readonly string[] }> => {
  const aliases: Record<string, string[]> = {};
  const directories: string[] = [];
  const limit = resolve(root);
  for (const path of files.filter((file) => /(?:^|\/)package\.json$/.test(file))) {
    const name = packageName(join(root, path));
    const directory = dirname(join(root, path));
    const absolute = resolve(directory);
    if (absolute !== limit) directories.push(absolute);
    if (name) aliases[name] = [directory];
  }
  return { aliases, directories };
};

/**
 * Create the native resolver, optionally applying the project's own custom conditions.
 *
 * @impure Reads the filesystem through the native resolver factory.
 * @param typeOnly - Whether the import must resolve to type declarations.
 * @param conditions - Conditions to try before the built-in `source`, `import`, `node` and
 * `default` conditions.
 * @returns A resolver bound to those conditions.
 */
const createResolver = (typeOnly: boolean, conditions: readonly string[]): ResolverFactory =>
  new ResolverFactory({
    tsconfig: 'auto',
    builtinModules: true,
    conditionNames: [...conditions, ...(typeOnly ? ['types'] : []), 'import', 'node', 'default'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', ...(typeOnly ? ['.d.ts'] : []), '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    allowPackageExportsInDirectoryResolve: true,
  });

/** @impure Read filesystem and compiler configuration to resolve imports. */
export const resolveImports = (
  root: string,
  analyzed: readonly AnalyzedFile[],
  allPaths: readonly string[],
): readonly ResolvedImport[] => {
  const owned = new Set(analyzed.map((file) => file.source.path));
  const { aliases, directories } = packageAliases(root, allPaths);
  const result: ResolvedImport[] = [];
  const conditionCache = new Map<string, readonly string[]>();
  const resolverCache = new Map<string, ResolverFactory>();
  for (const { source, parsed } of analyzed)
    for (const imported of parsed.imports) {
      try {
        const owner = Object.keys(aliases).find(
          (name) => imported.specifier === name || imported.specifier.startsWith(`${name}/`),
        );
        const origin = owner
          ? join(aliases[owner]?.[0] ?? root, 'package.json')
          : resolve(root, source.path);
        const conditions = compilerConditions(root, source.path, conditionCache);
        const key = `${imported.typeOnly}:${conditions.join(',')}`;
        let selectedResolver = resolverCache.get(key);
        if (!selectedResolver) {
          selectedResolver = createResolver(imported.typeOnly, conditions);
          resolverCache.set(key, selectedResolver);
        }
        let resolved = selectedResolver.resolveFileSync(origin, imported.specifier);
        const packageSpecifier = !/^[.#]/.test(imported.specifier);
        if (packageSpecifier && (!resolved.path || resolved.builtin)) {
          // A package entry point never falls back to development source; retry without it.
          const plainKey = `${imported.typeOnly}:plain`;
          let plainResolver = resolverCache.get(plainKey);
          if (!plainResolver) {
            plainResolver = createResolver(imported.typeOnly, []);
            resolverCache.set(plainKey, plainResolver);
          }
          const plain = plainResolver.resolveFileSync(origin, imported.specifier);
          if (plain.path && !plain.builtin) resolved = plain;
        }
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
          target: classifyTarget(
            root,
            owned,
            imported.specifier,
            resolved.path,
            Boolean(resolved.packageJsonPath),
            directories,
          ),
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

/** @impure Inspect the project dependency directory. */
export const hasInstalledDependencies = (root: string): boolean =>
  existsSync(join(root, 'node_modules'));
