/**
 * @boundary Read project sources and configuration for checking; propagate filesystem failures to the CLI.
 * @effects node:fs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSources, runChecks } from '#check/engine';
import { excluded, selected } from '#check/configuration';
import { loadConfiguration } from '#check/config-reader.b';
import { resolveImports } from '#check/resolver.b';
import type { Diagnostic, CheckConfig, SourceFile } from '#check/types';

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

/** @impure Read project sources and resolve their filesystem imports. */
export const checkSourceProject = (
  root: string,
  configuration?: CheckConfig,
): readonly Diagnostic[] => {
  const config = configuration ?? loadConfiguration(root);
  const paths = projectPaths(root, config);
  const files: SourceFile[] = paths
    .filter((path) => selected(path, config))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const imports = resolveImports(root, analyzeSources({ files }, config), paths);
  return runChecks({ files, imports }, config);
};
