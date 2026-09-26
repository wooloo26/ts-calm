/**
 * @boundary Read project sources and configuration for checking; propagate filesystem failures to the CLI.
 * @effects node:fs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSources, runChecks } from '#src/engine';
import { excluded, selected } from '#src/configuration';
import { loadConfiguration } from '#src/config-reader.b';
import { resolveImports } from '#src/resolver.b';
import type { Diagnostic, CheckConfig, SourceFile } from '#src/types';

/** @impure Enumerate project files on disk. */
export const projectPaths = (root: string, config: CheckConfig = {}): readonly string[] => {
  const paths: string[] = [];
  /** @impure Enumerate directories and append discovered paths. */
  const visit = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (excluded(path, config)) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) paths.push(path);
    }
  };
  visit('');
  return paths.toSorted();
};

/**
 * Read project sources and resolve their filesystem imports.
 *
 * @impure Reads project files from disk.
 * @param root - Absolute project root.
 * @param configuration - Optional explicit configuration; otherwise `ts-calm.config.ts` is loaded.
 * @returns Every source-rule diagnostic for the selected files.
 */
export const checkSourceProject = async (
  root: string,
  configuration?: CheckConfig,
): Promise<readonly Diagnostic[]> => {
  const config = configuration ?? loadConfiguration(root);
  const paths = projectPaths(root, config);
  const files: SourceFile[] = paths
    .filter((path) => selected(path, config))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const imports = resolveImports(root, analyzeSources({ files }, config), paths);
  return runChecks({ files, imports }, config);
};
