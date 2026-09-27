import { join, relative, resolve } from 'node:path';
import { err, get, isErr, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { issue } from '#src/core/issues';
import type { CheckIssue } from '#src/core/issues';
import { inside } from '#src/core/paths';

export type IndexEntry = Readonly<{ mode: string; object: string; path: string }>;
export type SnapshotEntry = IndexEntry & Readonly<{ destination: string }>;
const invalid = (message: string): Result<never, CheckIssue> =>
  err(issue('invalid-snapshot', 'prepare-snapshot', message));
const modeKind = (mode: string): string =>
  mode === '120000' ? 'symlink' : mode === '160000' ? 'submodule' : `entry of mode ${mode}`;

export const indexEntries = (index: string): Result<readonly IndexEntry[], CheckIssue> => {
  const entries: IndexEntry[] = [];
  for (const entry of index.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== '0')
      return invalid('Resolve index conflicts before checking staged content.');
    const mode = match[1] ?? '',
      object = match[2] ?? '',
      path = match[4] ?? '';
    if (mode !== '100644' && mode !== '100755')
      return invalid(
        `A staged ${modeKind(mode)} cannot be inspected as a source snapshot: ${path}. Unstage it, or check the working tree instead.`,
      );
    entries.push({ mode, object, path });
  }
  return ok(entries);
};
export const snapshotEntries = (
  temporary: string,
  index: string,
): Result<readonly SnapshotEntry[], CheckIssue> => {
  const parsed = indexEntries(index);
  if (isErr(parsed)) return parsed;
  const entries: SnapshotEntry[] = [];
  for (const entry of get(parsed)) {
    const destination = resolve(temporary, entry.path);
    if (destination === resolve(temporary) || !inside(temporary, destination))
      return invalid(`Staged path escapes the snapshot: ${entry.path}`);
    if (entry.path.split(/[\\/]/).some((part) => part === '.git' || part === 'node_modules'))
      return invalid(`Do not stage repository internals or dependencies: ${entry.path}`);
    entries.push({ ...entry, destination });
  }
  return ok(entries);
};
export const decodeBlobs = (
  output: Buffer,
  objects: readonly string[],
): Result<ReadonlyMap<string, Buffer>, CheckIssue> => {
  const contents = new Map<string, Buffer>();
  let cursor = 0;
  for (const object of objects) {
    const headerEnd = output.indexOf(10, cursor);
    if (headerEnd < 0) return invalid(`git cat-file --batch ended before ${object}.`);
    const [oid = '', kind = '', size = ''] = output
      .subarray(cursor, headerEnd)
      .toString('utf8')
      .split(' ');
    const length = Number(size),
      end = headerEnd + 1 + length;
    if (
      kind !== 'blob' ||
      !/^\d+$/.test(size) ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      oid !== object ||
      end >= output.length ||
      output[end] !== 10
    )
      return invalid(`git cat-file did not return the staged blob ${object}.`);
    contents.set(object, output.subarray(headerEnd + 1, end));
    cursor = end + 1;
  }
  return ok(contents);
};
export const dependencyTarget = (
  context: Readonly<{
    repository: string;
    snapshot: string;
    staged: ReadonlySet<string>;
    packages: ReadonlyMap<string, string>;
  }>,
  dependency: Readonly<{ name: string; original: string; directory: string }>,
): Result<Readonly<{ target: string; destination: string }>, CheckIssue> => {
  const { repository, snapshot, staged, packages } = context;
  const { name, original, directory } = dependency;
  const local = relative(repository, original).replaceAll('\\', '/');
  const workspace = inside(repository, original) && !local.split('/').includes('node_modules');
  if (workspace && !staged.has(local || '.'))
    return invalid(`Workspace dependency ${name} is missing from the staged snapshot: ${local}.`);
  const packageDirectory = packages.get(name);
  const target = packageDirectory
    ? join(snapshot, packageDirectory)
    : workspace
      ? join(snapshot, local)
      : original;
  return ok({ target, destination: join(snapshot, directory, 'node_modules', name) });
};
