/**
 * @boundary Resolve imports against the inspected filesystem and report unresolved dependencies explicitly.
 * @effects node:fs
 * @effects oxc-resolver
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, captureResult } from '@ts-calm/fp/boundary';
import { get, getError, isErr, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import type { CheckFailure } from '#src/core/issues';
import { decodeManifest } from '#src/manifest';
import { ResolverFactory } from 'oxc-resolver';
import { classifyTarget } from '#src/resolution';
import { compilerConditions } from '#src/compiler-options.b';
import type { AnalyzedFile, ResolvedImport } from '#src/core/types';

/** @impure Read workspace manifests for import resolution. */
const packageAliases = (
  root: string,
  files: readonly string[],
): Result<
  Readonly<{ aliases: Record<string, string[]>; directories: readonly string[] }>,
  CheckFailure
> =>
  captureResult(
    () => {
      const aliases: Record<string, string[]> = {},
        directories: string[] = [];
      const limit = resolve(root);
      for (const path of files.filter((file) => /(?:^|\/)package\.json$/.test(file))) {
        const manifest = decodeManifest(readFileSync(join(root, path), 'utf8'));
        if (isErr(manifest)) return manifest;
        const name = get(manifest)['name'],
          directory = dirname(join(root, path)),
          absolute = resolve(directory);
        if (absolute !== limit) directories.push(absolute);
        if (typeof name === 'string' && name) aliases[name] = [directory];
      }
      return ok({ aliases, directories });
    },
    { name: 'read-workspace-manifests' },
  );

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
): Result<readonly ResolvedImport[], CheckFailure> => {
  const owned = new Set(analyzed.map((file) => file.source.path));
  const metadata = packageAliases(root, allPaths);
  if (isErr(metadata)) return metadata;
  const { aliases, directories } = get(metadata);
  const result: ResolvedImport[] = [];
  const conditionCache = new Map<string, readonly string[]>();
  const resolverCache = new Map<string, ResolverFactory>();
  for (const { source, parsed } of analyzed)
    for (const imported of parsed.imports) {
      const configured = compilerConditions(root, source.path, conditionCache);
      if (isErr(configured)) return configured;
      const conditions = get(configured);
      const captured = capture(
        () => {
          const owner = Object.keys(aliases).find(
            (name) => imported.specifier === name || imported.specifier.startsWith(`${name}/`),
          );
          const origin = owner
            ? join(aliases[owner]?.[0] ?? root, 'package.json')
            : resolve(root, source.path);
          const key = `${imported.typeOnly}:${conditions.join(',')}`;
          let selectedResolver = resolverCache.get(key);
          if (!selectedResolver) {
            selectedResolver = createResolver(imported.typeOnly, conditions);
            resolverCache.set(key, selectedResolver);
          }
          let resolved = selectedResolver.resolveFileSync(origin, imported.specifier);
          const packageSpecifier = !/^[.#]/.test(imported.specifier);
          if (packageSpecifier && (!resolved.path || resolved.builtin)) {
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
            return;
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
            return;
          }
          result.push({
            file: source.path,
            imported,
            target: classifyTarget(root, owned, {
              specifier: imported.specifier,
              resolved: resolved.path,
              packageTarget: Boolean(resolved.packageJsonPath),
              workspacePackages: directories,
            }),
          });
        },
        { name: 'resolve-import' },
      );
      if (isErr(captured)) {
        const fault = getError(captured);
        result.push({
          file: source.path,
          imported,
          target: {
            kind: 'error',
            message: fault.message,
          },
        });
      }
    }
  return ok(result);
};
