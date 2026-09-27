/**
 * @boundary Inspect a frozen Git index in a private directory and retain operation and cleanup failures.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:os
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { completeWithCleanup, err, get, isErr, ok } from '@ts-calm/fp';
import type { AsyncResult, Result } from '@ts-calm/fp';
import { capture, captureResult, captureResultAsync } from '@ts-calm/fp/boundary';
import { loadConfiguration } from '#src/config-reader.b';
import { checkProject } from '#src/project';
import { validateCommitMessage } from '#src/rules/commit-message';
import { snapshotEntries, decodeBlobs } from '#src/snapshot';
import type { SnapshotEntry } from '#src/snapshot';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';
import type { Diagnostic } from '#src/core/types';
import { linkSnapshotDependencies } from '#src/dependency-snapshot.b';

/** @impure Execute Git and return its exact output or an operational failure. */
const git = (
  root: string,
  args: readonly string[],
  input?: string,
): Result<Buffer, CheckFailure> => {
  const invoked = capture(
    () =>
      spawnSync('git', ['-C', root, ...args], {
        maxBuffer: 512 * 1024 * 1024,
        windowsHide: true,
        ...(typeof input === 'string' ? { input } : {}),
      }),
    { name: `git:${args[0] ?? 'command'}` },
  );
  if (isErr(invoked)) return invoked;
  const result = get(invoked);
  return result.error || result.status !== 0
    ? err(
        issue(
          'command-failed',
          'git',
          result.error?.message ||
            result.stderr?.toString('utf8') ||
            (result.signal ? `Git terminated by ${result.signal}.` : 'Git failed.'),
        ),
      )
    : ok(result.stdout);
};

/** @impure Fetch staged blobs and materialize already validated paths. */
const materialize = (
  root: string,
  temporary: string,
  index: string,
): Result<readonly SnapshotEntry[], CheckFailure> => {
  const planned = snapshotEntries(temporary, index);
  if (isErr(planned)) return planned;
  const entries = get(planned),
    objects = [...new Set(entries.map((entry) => entry.object))];
  const output = git(root, ['cat-file', '--batch'], `${objects.join('\n')}\n`);
  if (isErr(output)) return output;
  const decoded = decodeBlobs(get(output), objects);
  if (isErr(decoded)) return decoded;
  const contents = get(decoded);
  return captureResult(
    () => {
      for (const entry of entries) {
        const content = contents.get(entry.object);
        if (!content)
          return err(
            issue(
              'invalid-snapshot',
              'materialize-snapshot',
              `No staged content for ${entry.path}.`,
            ),
          );
        mkdirSync(dirname(entry.destination), { recursive: true });
        writeFileSync(entry.destination, content);
        if (entry.mode === '100755') chmodSync(entry.destination, 0o755);
      }
      return ok(entries);
    },
    { name: 'materialize-snapshot' },
  );
};

/** @impure Materialize and inspect an owned snapshot, checking that the index remains frozen. */
const inspectSnapshot = async <Value>(
  context: Readonly<{ repository: string; directory: string; before: string }>,
  inspect: (
    snapshotRoot: string,
  ) => Result<Value, CheckFailure> | PromiseLike<Result<Value, CheckFailure>>,
): AsyncResult<Value, CheckFailure> => {
  const { repository, directory, before } = context;
  const prepared = materialize(repository, directory, before);
  if (isErr(prepared)) return prepared;
  const linked = linkSnapshotDependencies(
    repository,
    directory,
    get(prepared)
      .map((entry) => entry.path)
      .filter((path) => /(?:^|\/)package\.json$/.test(path)),
  );
  if (isErr(linked)) return linked;
  const result = await inspect(directory);
  if (isErr(result)) return result;
  const after = git(repository, ['ls-files', '--stage', '-z']);
  if (isErr(after)) return after;
  return before === get(after).toString('utf8')
    ? result
    : err(
        issue('invalid-snapshot', 'inspect-snapshot', 'Git index changed while checking; retry.'),
      );
};

/** @impure Create a private snapshot and always release it after the supplied Result-based inspection. */
export const withStagedProject = async <Value>(
  root: string,
  inspect: (
    snapshotRoot: string,
  ) => Result<Value, CheckFailure> | PromiseLike<Result<Value, CheckFailure>>,
): AsyncResult<Value, CheckFailure> => {
  const found = git(root, ['rev-parse', '--show-toplevel']);
  if (isErr(found)) return found;
  const repository = get(found).toString('utf8').trim();
  const index = git(repository, ['ls-files', '--stage', '-z']);
  if (isErr(index)) return index;
  const created = capture(() => mkdtempSync(join(tmpdir(), 'ts-calm-staged-')), {
    name: 'create-snapshot',
  });
  if (isErr(created)) return created;
  const directory = get(created);
  const result = await captureResultAsync(
    () => inspectSnapshot({ repository, directory, before: get(index).toString('utf8') }, inspect),
    { name: 'inspect-snapshot' },
  );
  const cleaned = capture(() => rmSync(directory, { recursive: true, force: true }), {
    name: 'remove-snapshot',
  });
  return completeWithCleanup(result, [cleaned]);
};

/** @impure Inspect every source in the frozen Git index. */
export const checkStaged = (root: string): AsyncResult<readonly Diagnostic[], CheckFailure> =>
  withStagedProject(root, checkProject);
/** @impure Load the staged policy and validate the supplied commit message. */
export const checkStagedMessage = (
  root: string,
  message: string,
): AsyncResult<readonly Diagnostic[], CheckFailure> =>
  withStagedProject(root, (snapshot) => {
    const config = loadConfiguration(snapshot);
    return isErr(config) ? config : ok(validateCommitMessage(message, get(config)));
  });
