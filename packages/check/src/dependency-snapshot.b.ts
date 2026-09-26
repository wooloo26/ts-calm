/**
 * @boundary Build a dependency view whose workspace links stay inside the staged snapshot.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Missing staged workspace packages must never fall back to live sources.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const inside = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
};

/** @impure Enumerate public dependency entries, without exposing the package manager's store. */
const dependencies = (directory: string): readonly string[] => {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const name of readdirSync(join(directory, entry.name)))
        result.push(`${entry.name}/${name}`);
    } else if (entry.isDirectory() || entry.isSymbolicLink()) result.push(entry.name);
  }
  return result;
};

/** @impure Create private dependency directories and link each installed package to its allowed origin. */
export const linkSnapshotDependencies = (
  repository: string,
  snapshot: string,
  manifests: readonly string[],
): void => {
  const staged = new Set(manifests.map((path) => dirname(path).replaceAll('\\', '/')));
  const packages = new Map<string, string>();
  for (const manifest of manifests) {
    const data: unknown = JSON.parse(readFileSync(join(snapshot, manifest), 'utf8'));
    if (typeof data === 'object' && data && 'name' in data && typeof data.name === 'string')
      packages.set(data.name, dirname(manifest));
  }
  for (const manifest of manifests) {
    const directory = dirname(manifest);
    const installed = join(repository, directory, 'node_modules');
    for (const name of dependencies(installed)) {
      const installedPath = join(installed, name);
      const linked = lstatSync(installedPath).isSymbolicLink()
        ? resolve(dirname(installedPath), readlinkSync(installedPath))
        : installedPath;
      const original = existsSync(linked) ? realpathSync(linked) : linked;
      const local = relative(repository, original).replaceAll('\\', '/');
      const workspace = inside(repository, original) && !local.split('/').includes('node_modules');
      if (workspace && !staged.has(local || '.'))
        throw new Error(
          `Workspace dependency ${name} is missing from the staged snapshot: ${local}.`,
        );
      const packageDirectory = packages.get(name);
      const target = packageDirectory
        ? join(snapshot, packageDirectory)
        : workspace
          ? join(snapshot, local)
          : realpathSync(installedPath);
      const destination = join(snapshot, directory, 'node_modules', name);
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(target, destination, 'junction');
    }
  }
};
