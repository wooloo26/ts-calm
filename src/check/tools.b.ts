/**
 * @boundary Execute pinned static tools against the selected project and normalize their reports.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects node:os
 * @effects process
 * @allow strict-fp/no-throw -- Missing tools, malformed reports and invalid configurations are operational failures.
 * @allow strict-fp/no-try -- Remove only this invocation's compiler cache in finally, including tool failures.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture } from '#fp/capture.b';
import { get, getError, isErr } from '#fp/containers';
import { projectPaths } from '#check/sources.b';
import { lintDiagnostics, typeDiagnostics, isLintReport } from '#check/tool-output';
import type { Diagnostic } from '#check/types';

export const lintConfigNames = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
] as const;
export const formatConfigNames = [
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxfmt.config.ts',
  'oxfmt.config.mts',
] as const;
export const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const load = createRequire(import.meta.url);

/** @impure Inspect filesystem configuration paths. */
export const findConfiguration = (root: string, names: readonly string[]): string =>
  names.find((name) => existsSync(join(root, name))) ?? '';

/** @impure Resolve the pinned tool entry in the installed dependency graph. */
const binary = (name: string, path: string): string =>
  join(dirname(load.resolve(`${name}/package.json`)), path);
const fileName = (root: string, file: string): string =>
  (isAbsolute(file) ? relative(root, file) : file).replaceAll('\\', '/');

/** @impure Run a pinned subprocess with the current host environment. */
const execute = (
  root: string,
  executable: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>> = {},
) => {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...environment },
  });
  if (result.error) throw new Error(`Cannot start ${executable}: ${result.error.message}`);
  if (result.signal) throw new Error(`Tool terminated by ${result.signal}.`);
  return { status: result.status ?? 2, stdout: result.stdout, stderr: result.stderr };
};

/** @impure Read project files and execute the formatter, optionally writing formatted files. */
export const formatProject = (
  root: string,
  check = true,
  selectedPaths?: readonly string[],
): readonly Diagnostic[] => {
  const paths =
    selectedPaths ??
    projectPaths(root).filter((path) =>
      /\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|mdx?|css|scss|html|vue|svelte)$/.test(path),
    );
  if (paths.length === 0) return [];
  const config = findConfiguration(root, formatConfigNames);
  const args = [
    check ? '--list-different' : '--write',
    '--no-error-on-unmatched-pattern',
    ...(config ? [] : ['--config', join(packageRoot, '.oxfmtrc.json')]),
    ...paths,
  ];
  const output = execute(root, binary('oxfmt', 'bin/oxfmt'), args);
  if (output.status === 0) return [];
  if (output.status !== 1) throw new Error(output.stderr || output.stdout || 'Formatter failed.');
  const changed = output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => paths.some((path) => fileName(root, line) === path));
  return (changed.length ? changed : ['<format>']).map((file) => ({
    rule: 'fmt/format',
    file: fileName(root, file),
    line: 1,
    column: 1,
    severity: 'error',
    message: 'Formatting differs from the project preset.',
    help: 'Run ts-calm fmt, then stage the intended changes.',
  }));
};

/** @impure Execute the pinned type-aware linter and its backend. */
export const lintProject = (root: string): readonly Diagnostic[] => {
  const backend = createRequire(load.resolve('oxlint-tsgolint/package.json'));
  const native = backend.resolve(
    `@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${process.platform === 'win32' ? '.exe' : ''}`,
  );
  const config = findConfiguration(root, lintConfigNames);
  const output = execute(
    root,
    binary('oxlint', 'bin/oxlint'),
    [
      '--type-aware',
      '--format',
      'json',
      '--ignore-pattern',
      '**/dist/**',
      '--ignore-pattern',
      '**/build/**',
      '--ignore-pattern',
      '**/.local/**',
      ...(config ? [] : ['--config', join(packageRoot, '.oxlintrc.json')]),
      '.',
    ],
    { OXLINT_TSGOLINT_PATH: native },
  );
  const parsed = capture((): unknown => JSON.parse(output.stdout), { name: 'oxlint-report' });
  if (isErr(parsed))
    throw new Error(output.stderr || `Invalid Oxlint report: ${getError(parsed).message}`);
  if (!isLintReport(get(parsed)) || output.status > 1)
    throw new Error(output.stderr || output.stdout || 'Oxlint failed.');
  return lintDiagnostics(get(parsed), (file) => fileName(root, file));
};

/** @impure Execute the compiler with an owned temporary build cache. */
export const typecheckProject = (root: string): readonly Diagnostic[] => {
  const config = join(root, 'tsconfig.json');
  if (!existsSync(config))
    throw new Error(
      'tsconfig.json is missing. Run ts-calm init or provide your project configuration.',
    );
  const temporary = mkdtempSync(join(tmpdir(), 'ts-calm-types-'));
  try {
    const output = execute(root, binary('typescript', 'bin/tsc'), [
      '--project',
      resolve(config),
      '--noEmit',
      '--pretty',
      'false',
      '--incremental',
      '--tsBuildInfoFile',
      join(temporary, 'check.tsbuildinfo'),
    ]);
    const diagnostics = typeDiagnostics(output.stdout, (file) => fileName(root, file));
    if (output.status !== 0 && diagnostics.length === 0)
      throw new Error(output.stderr || output.stdout || 'TypeScript failed.');
    return diagnostics;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};
