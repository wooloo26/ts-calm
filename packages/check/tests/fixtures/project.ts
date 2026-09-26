import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/** @impure Write one project-relative file, creating its directories. */
export const write = (root: string, path: string, content: string): void => {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
};

/** Keep a synchronous inspection usable where an asynchronous one is expected. */
const settle = async <Value>(value: Value | Promise<Value>): Promise<Value> =>
  value instanceof Promise ? await value : value;

/**
 * Create a disposable project directory, write the supplied files and inspect the result.
 *
 * The inspection may be synchronous or asynchronous; the directory is removed after it
 * settles, so an async inspection can be awaited directly.
 *
 * @param files - Project-relative paths mapped to their content.
 * @param inspect - Inspection invoked with the temporary project root.
 * @returns The inspection result.
 */
export const withProject = async <Value>(
  files: Readonly<Record<string, string>>,
  inspect: (root: string) => Value | Promise<Value>,
): Promise<Value> => {
  const root = mkdtempSync(join(tmpdir(), 'ts-calm-test-'));
  try {
    write(root, 'package.json', '{"type":"module"}');
    for (const [path, content] of Object.entries(files)) write(root, path, content);
    return await settle(inspect(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

/** @impure Link the repository dependency directory into a disposable project. */
export const linkDependencies = (root: string): void => {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction');
};
/** @impure Execute Git in a disposable project. */
export const git = (root: string, ...args: string[]): string => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
};
/** @impure Initialize a Git repository and stage every project file. */
export const initializeGit = (root: string): void => {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '.');
};
