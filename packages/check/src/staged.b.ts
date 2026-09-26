/**
 * @boundary Inspect a frozen Git index in an isolated temporary directory; leave the index and checkout untouched.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:os
 * @allow strict-fp/no-throw -- Git conflicts, unsafe paths and index changes are operational failures.
 * @allow strict-fp/no-try -- Always remove only the temporary directory owned by this invocation.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { loadConfiguration } from '#src/config-reader.b';
import { checkProject } from '#src/project';
import { hasInstalledDependencies } from '#src/resolver.b';
import { validateCommitMessage } from '#src/commit-message';
import type { Diagnostic } from '#src/types';

/** @impure Execute Git and collect its output. */
const git = (root: string, args: readonly string[]): Buffer => {
  const result = spawnSync('git', ['-C', root, ...args], {
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? result.stderr.toString('utf8'));
  return result.stdout;
};

/** @impure Read Git objects and write this invocation's snapshot. */
const materialize = (root: string, temporary: string, index: string): void => {
  for (const entry of index.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== '0')
      throw new Error('Resolve index conflicts before checking staged content.');
    const mode = match[1],
      object = match[2] ?? '',
      path = match[4] ?? '';
    if (mode !== '100644' && mode !== '100755')
      throw new Error(
        `Unsupported staged entry ${path}; symlinks and submodules cannot be inspected as source snapshots.`,
      );
    const destination = resolve(temporary, path);
    const within = relative(temporary, destination);
    if (
      !within ||
      within === '..' ||
      within.startsWith(`..${String.fromCharCode(92)}`) ||
      within.startsWith('../') ||
      isAbsolute(within)
    )
      throw new Error(`Staged path escapes the snapshot: ${path}`);
    if (path.split(/[\\/]/).some((part) => part === '.git' || part === 'node_modules'))
      throw new Error(`Do not stage repository internals or dependencies: ${path}`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, git(root, ['cat-file', 'blob', object]));
    if (mode === '100755') chmodSync(destination, 0o755);
  }
};

/**
 * Create a temporary index snapshot, invoke the inspection, and remove the snapshot again.
 *
 * @impure Reads Git objects and writes this invocation's snapshot.
 * @param root - Any directory inside the inspected Git repository.
 * @param inspect - Async inspection invoked with the snapshot root.
 * @returns The inspection result.
 * @throws If the index has conflicts, changes while checking, or contains unsupported entries.
 */
export const withStagedProject = async <Value>(
  root: string,
  inspect: (snapshotRoot: string) => Promise<Value>,
): Promise<Value> => {
  const repository = git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const before = git(repository, ['ls-files', '--stage', '-z']).toString('utf8');
  const temporary = mkdtempSync(join(tmpdir(), 'ts-calm-staged-'));
  try {
    materialize(repository, temporary, before);
    if (hasInstalledDependencies(repository))
      symlinkSync(
        realpathSync(join(repository, 'node_modules')),
        join(temporary, 'node_modules'),
        'junction',
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
