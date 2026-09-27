/**
 * @boundary Discover installed packages and link them to the origins selected by the snapshot policy.
 * @effects node:fs
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
import { dirname, join, resolve } from 'node:path';
import { get, isErr, ok } from '@ts-calm/fp';
import type { Result, Unit } from '@ts-calm/fp';
import { captureResult } from '@ts-calm/fp/boundary';
import { dependencyTarget } from '#src/snapshot';
import { decodeManifest } from '#src/manifest';
import type { CheckFailure } from '#src/core/issues';

/** @impure Enumerate public dependency entries without exposing the package manager store. */
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

/** @impure Link installed dependencies into this invocation's private snapshot. */
export const linkSnapshotDependencies = (
  repository: string,
  snapshot: string,
  manifests: readonly string[],
): Result<Unit, CheckFailure> =>
  captureResult(
    () => {
      const staged = new Set(manifests.map((path) => dirname(path).replaceAll('\\', '/')));
      const packages = new Map<string, string>();
      for (const path of manifests) {
        const decoded = decodeManifest(readFileSync(join(snapshot, path), 'utf8'));
        if (isErr(decoded)) return decoded;
        const name = get(decoded)['name'];
        if (typeof name === 'string') packages.set(name, dirname(path));
      }
      for (const path of manifests) {
        const directory = dirname(path),
          installed = join(repository, directory, 'node_modules');
        for (const name of dependencies(installed)) {
          const installedPath = join(installed, name);
          const linked = lstatSync(installedPath).isSymbolicLink()
            ? resolve(dirname(installedPath), readlinkSync(installedPath))
            : installedPath;
          const original = existsSync(linked) ? realpathSync(linked) : linked;
          const planned = dependencyTarget(
            { repository, snapshot, staged, packages },
            { name, original, directory },
          );
          if (isErr(planned)) return planned;
          const { target, destination } = get(planned);
          // External dependencies must exist; only staged workspace targets may replace missing live files.
          if (target === original) realpathSync(installedPath);
          mkdirSync(dirname(destination), { recursive: true });
          symlinkSync(target, destination, 'junction');
        }
      }
      return ok();
    },
    { name: 'link-snapshot-dependencies' },
  );
