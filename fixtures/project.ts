import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const write = (root: string, path: string, content: string): void => {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
};
export const withProject = <Value>(
  files: Readonly<Record<string, string>>,
  inspect: (root: string) => Value,
): Value => {
  const root = mkdtempSync(join(tmpdir(), 'ts-calm-test-'));
  try {
    write(root, 'package.json', '{"type":"module"}');
    for (const [path, content] of Object.entries(files)) write(root, path, content);
    return inspect(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};
export const linkDependencies = (root: string): void => {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'junction');
};
export const git = (root: string, ...args: string[]): string => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
};
export const initializeGit = (root: string): void => {
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '.');
};
