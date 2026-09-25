/**
 * @boundary Read project sources and configuration for checking; propagate filesystem failures to the CLI.
 * @effects node:fs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSources, runGates } from './engine.ts';
import { excluded, selected } from './configuration.ts';
import { loadConfiguration } from './config-reader.b.ts';
import { resolveImports } from './resolver.b.ts';
import type { Diagnostic, GateConfiguration, SourceFile } from './types.ts';

export const projectPaths = (root: string, config: GateConfiguration = {}): readonly string[] => {
  const paths: string[] = [];
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

export const checkProject = (
  root: string,
  configuration?: GateConfiguration,
): readonly Diagnostic[] => {
  const config = configuration ?? loadConfiguration(root);
  const paths = projectPaths(root, config);
  const files: SourceFile[] = paths
    .filter((path) => selected(path, config))
    .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
  const imports = resolveImports(root, analyzeSources({ files }, config), paths);
  return runGates({ files, imports }, config);
};
