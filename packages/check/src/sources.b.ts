/**
 * @boundary Enumerate and read project sources, converting filesystem failures at their entry point.
 * @effects node:fs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capture } from '@ts-calm/fp/boundary';
import type { Result } from '@ts-calm/fp';
import { excluded, selected } from '#src/core/configuration';
import type { CheckConfig, SourceFile } from '#src/core/types';
import type { CheckFailure } from '#src/core/issues';

/** @impure Enumerate regular project files on disk. */
const projectPaths = (root: string, config: CheckConfig): readonly string[] => {
  const paths: string[] = [];
  /** @impure Read directories and append discovered paths. */
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

/** @impure Read the selected sources while preserving all paths for workspace resolution. */
export const readSources = (
  root: string,
  config: CheckConfig,
): Result<Readonly<{ files: readonly SourceFile[]; paths: readonly string[] }>, CheckFailure> =>
  capture(
    () => {
      const paths = projectPaths(root, config);
      const files = paths
        .filter((path) => selected(path, config))
        .map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') }));
      return { files, paths };
    },
    { name: 'read-project-sources' },
  );
