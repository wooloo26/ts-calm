/**
 * @boundary Execute pinned static tools against the selected project and normalize their reports.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects node:os
 * @effects process
 * @allow strict-fp/no-throw -- Missing tools, malformed reports and invalid configurations are operational failures.
 * @allow strict-fp/no-try -- Remove only this invocation's compiler cache in finally, including tool failures.
 * @allow strict-fp/no-assertion -- The parsed configuration was narrowed to a plain object and is forwarded to Oxfmt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'oxfmt';
import type { FormatOptions } from 'oxfmt';
import { capture } from '@ts-calm/fp/boundary';
import { get, getError, isErr, isPlainObject } from '@ts-calm/fp';
import { projectPaths } from '#src/sources.b';
import { lintDiagnostics, typeDiagnostics, isLintReport } from '#src/tool-output';
import type { Diagnostic } from '#src/types';

/** The formatter configurations a project can own, in the order they are preferred. */
export const formatConfigNames = [
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxfmt.config.ts',
  'oxfmt.config.mts',
] as const;
/** The linter configurations a project can own, in the order they are preferred. */
export const lintConfigNames = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
] as const;
export const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const load = createRequire(import.meta.url);
/** The published formatter preset, used by projects without their own configuration. */
const BUNDLED_FORMAT_OPTIONS: FormatOptions = { singleQuote: true, printWidth: 100 };

/**
 * The Node type definitions this package vendors for consumers.
 *
 * They are third-party declarations, not project source, so neither the formatter nor the
 * linter is pointed at them.
 */
const committedTypeBundles = /(?:^|\/)types\/(?:node|undici-types)\//;

/** @impure Inspect filesystem configuration paths. */
export const findConfiguration = (root: string, names: readonly string[]): string =>
  names.find((name) => existsSync(join(root, name))) ?? '';

/** @impure Resolve the pinned tool entry in the installed dependency graph. */
const binary = (name: string, path: string): string =>
  join(dirname(load.resolve(`${name}/package.json`)), path);
const fileName = (root: string, file: string): string =>
  (isAbsolute(file) ? relative(root, file) : file).replaceAll('\\', '/');

/**
 * Resolve the formatter options for one project.
 *
 * @impure Reads the project's JSON formatter configuration when it exists.
 * @param root - Absolute project root.
 * @returns The project configuration, or the bundled preset for projects without one.
 * @throws If the project configuration exists but does not contain a JSON object.
 */
export const formatterOptions = (root: string): FormatOptions => {
  const path = join(root, '.oxfmtrc.json');
  if (!existsSync(path)) return BUNDLED_FORMAT_OPTIONS;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isPlainObject(parsed)) throw new Error('.oxfmtrc.json must contain a JSON object.');
  return parsed as FormatOptions;
};

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

/**
 * Format the selected project files, or report the ones whose formatting differs.
 *
 * @impure Reads project files and, in write mode, rewrites them.
 * The bundled preset is used when the project has no JSON formatter configuration; a
 * malformed project configuration is an operational failure rather than a formatting diff.
 * Files the formatter has no support for are skipped instead of failing the check.
 *
 * @param root - Absolute project root.
 * @param check - `true` reports differences, `false` writes the formatted result.
 * @param selectedPaths - Root-relative paths to visit; defaults to every formattable project file.
 * @returns One diagnostic per file whose formatting differs, or `[]` when everything matches.
 */
export const formatProject = async (
  root: string,
  check = true,
  selectedPaths?: readonly string[],
): Promise<readonly Diagnostic[]> => {
  const paths =
    selectedPaths ??
    projectPaths(root)
      .filter((path) => !committedTypeBundles.test(path))
      .filter((path) =>
        /\.(?:[cm]?[jt]sx?|jsonc?|ya?ml|mdx?|css|scss|html|vue|svelte)$/.test(path),
      );
  if (paths.length === 0) return [];
  const options = formatterOptions(root);
  const diagnostics: Diagnostic[] = [];
  for (const path of paths) {
    const content = readFileSync(join(root, path), 'utf8');
    const result = await format(path, content, options).catch(() => {});
    if (!result) continue;
    if (result.errors.length > 0) continue;
    if (result.code === content) continue;
    if (!check) {
      writeFileSync(join(root, path), result.code);
      continue;
    }
    diagnostics.push({
      rule: 'fmt/format',
      file: path,
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Formatting differs from the project preset.',
      help: 'Run your formatter (for example `pnpm fmt`), then stage the intended changes.',
    });
  }
  return diagnostics;
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
      '**/node_modules/**',
      '--ignore-pattern',
      '**/.turbo/**',
      '--ignore-pattern',
      '**/dist/**',
      '--ignore-pattern',
      '**/build/**',
      '--ignore-pattern',
      '**/.local/**',
      // The vendored Node type definitions are third-party declarations, not project source.
      '--ignore-pattern',
      '**/types/node/**',
      '--ignore-pattern',
      '**/types/undici-types/**',
      ...(config ? [] : ['--config', resolve(packageRoot, 'presets/oxlint.json')]),
      '.',
    ],
    { OXLINT_TSGOLINT_PATH: native },
  );
  const report = output.stdout.trim();
  if (report.startsWith('No files')) return [];
  const parsed = capture((): unknown => JSON.parse(report), { name: 'oxlint-report' });
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
