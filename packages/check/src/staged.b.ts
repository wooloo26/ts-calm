/**
 * @boundary Inspect a frozen Git index in an isolated temporary directory; leave the index and checkout untouched.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:os
 * @allow strict-fp/no-throw -- Git conflicts, unsafe paths and index changes are operational failures.
 * @allow strict-fp/no-try -- Always remove only the temporary directory owned by this invocation.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { loadConfiguration } from '#src/config-reader.b';
import { checkProject } from '#src/project';
import { validateCommitMessage } from '#src/rules/commit-message';
import type { Diagnostic } from '#src/core/types';
import { linkSnapshotDependencies } from '#src/dependency-snapshot.b';

/** @impure Execute Git and collect its output. */
const git = (root: string, args: readonly string[], input?: string): Buffer => {
  const result = spawnSync('git', ['-C', root, ...args], {
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
    ...(typeof input === 'string' ? { input } : {}),
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.toString('utf8'));
  return result.stdout;
};

type IndexEntry = Readonly<{ mode: string; object: string; path: string }>;

const newline = 10;
const modeKind = (mode: string): string =>
  mode === '120000' ? 'symlink' : mode === '160000' ? 'submodule' : `entry of mode ${mode}`;

const indexEntries = (index: string): readonly IndexEntry[] => {
  const entries: IndexEntry[] = [];
  for (const entry of index.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== '0')
      throw new Error('Resolve index conflicts before checking staged content.');
    const mode = match[1] ?? '',
      object = match[2] ?? '',
      path = match[4] ?? '';
    if (mode !== '100644' && mode !== '100755')
      throw new Error(
        `A staged ${modeKind(mode)} cannot be inspected as a source snapshot: ${path}. Unstage it, or check the working tree instead.`,
      );
    entries.push({ mode, object, path });
  }
  return entries;
};

/** @impure Read every distinct staged blob in one Git invocation. */
const blobs = (root: string, objects: readonly string[]): ReadonlyMap<string, Buffer> => {
  const wanted = [...new Set(objects)];
  const output = git(root, ['cat-file', '--batch'], `${wanted.join('\n')}\n`);
  const contents = new Map<string, Buffer>();
  let cursor = 0;
  for (const object of wanted) {
    const headerEnd = output.indexOf(newline, cursor);
    if (headerEnd < 0) throw new Error(`git cat-file --batch ended before ${object}.`);
    const [oid = '', kind = '', size = ''] = output
      .subarray(cursor, headerEnd)
      .toString('utf8')
      .split(' ');
    const length = Number(size);
    if (kind !== 'blob' || !Number.isSafeInteger(length) || oid !== object)
      throw new Error(`git cat-file did not return the staged blob ${object}.`);
    contents.set(object, output.subarray(headerEnd + 1, headerEnd + 1 + length));
    cursor = headerEnd + 1 + length + 1;
  }
  return contents;
};

/** @impure Read Git objects and write this invocation's snapshot. */
const materialize = (root: string, temporary: string, index: string): readonly IndexEntry[] => {
  const entries = indexEntries(index);
  const contents = blobs(
    root,
    entries.map((entry) => entry.object),
  );
  for (const entry of entries) {
    const destination = resolve(temporary, entry.path);
    const within = relative(temporary, destination);
    if (
      !within ||
      within === '..' ||
      within.startsWith(`..${String.fromCharCode(92)}`) ||
      within.startsWith('../') ||
      isAbsolute(within)
    )
      throw new Error(`Staged path escapes the snapshot: ${entry.path}`);
    if (entry.path.split(/[\\/]/).some((part) => part === '.git' || part === 'node_modules'))
      throw new Error(`Do not stage repository internals or dependencies: ${entry.path}`);
    const content = contents.get(entry.object);
    if (!content) throw new Error(`No staged content for ${entry.path}.`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
    if (entry.mode === '100755') chmodSync(destination, 0o755);
  }
  return entries;
};

/**
 * Create a temporary index snapshot, invoke the inspection, and remove the snapshot again.
 *
 * @impure Reads Git objects and writes this invocation's snapshot.
 * @param root - Any directory inside the inspected Git repository.
 * @param inspect - Async inspection invoked with the snapshot root.
 * @returns The inspection result.
 * @throws If the index has conflicts, changes while checking, holds an entry that is not a
 * regular file, or holds an escaping path.
 */
export const withStagedProject = async <Value>(
  root: string,
  inspect: (snapshotRoot: string) => Promise<Value>,
): Promise<Value> => {
  const repository = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const before = git(repository, ['ls-files', '--stage', '-z']).toString('utf8');
  const temporary = mkdtempSync(join(tmpdir(), 'ts-calm-staged-'));
  try {
    const entries = materialize(repository, temporary, before);
    linkSnapshotDependencies(
      repository,
      temporary,
      entries.map((entry) => entry.path).filter((path) => /(?:^|\/)package\.json$/.test(path)),
    );
    const result = await inspect(temporary);
    const after = git(repository, ['ls-files', '--stage', '-z']).toString('utf8');
    if (before !== after) throw new Error('Git index changed while checking; retry.');
    return result;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

/** @impure Inspect the Git index using external static tools. */
export const checkStaged = (root: string): Promise<readonly Diagnostic[]> =>
  withStagedProject(root, checkProject);
/** @impure Read the staged commit policy and validate the supplied message. */
export const checkStagedMessage = (root: string, message: string): Promise<readonly Diagnostic[]> =>
  withStagedProject(root, (snapshot) =>
    Promise.resolve(validateCommitMessage(message, loadConfiguration(snapshot))),
  );
