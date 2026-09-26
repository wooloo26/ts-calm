/**
 * @boundary Execute the pinned compiler against the selected project and normalize its report.
 * @effects node:child_process
 * @effects node:fs
 * @effects node:module
 * @effects node:os
 * @effects process
 * @allow strict-fp/no-throw -- A missing configuration, or a compiler that reports nothing, is an operational failure.
 * @allow strict-fp/no-try -- Remove only this invocation's compiler cache in finally.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Diagnostic } from '#src/types';

const load = createRequire(import.meta.url);
/** @impure Resolve the pinned compiler in the installed dependency graph. */
const binary = (name: string, path: string): string =>
  join(dirname(load.resolve(`${name}/package.json`)), path);
const fileName = (root: string, file: string): string =>
  (isAbsolute(file) ? relative(root, file) : file).replaceAll('\\', '/');

/** @impure Run the compiler with the current host environment. */
const execute = (root: string, executable: string, args: readonly string[]) => {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw new Error(`Cannot start ${executable}: ${result.error.message}`);
  if (result.signal) throw new Error(`Compiler terminated by ${result.signal}.`);
  return { status: result.status ?? 2, stdout: result.stdout, stderr: result.stderr };
};

/**
 * Parse the report `tsc --pretty false` prints, including its global diagnostics.
 *
 * A line that matches neither form continues the previous message, which is how the compiler
 * renders a multi-line explanation.
 */
const typeDiagnostics = (
  output: string,
  normalize: (file: string) => string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(.*?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.*)$/.exec(line);
    const global = /^(error|warning) TS(\d+): (.*)$/.exec(line);
    if (match)
      diagnostics.push({
        rule: `typecheck/TS${match[5]}`,
        file: normalize(match[1] ?? ''),
        line: Number(match[2]),
        column: Number(match[3]),
        severity: match[4] === 'warning' ? 'warning' : 'error',
        message: match[6] ?? '',
      });
    else if (global)
      diagnostics.push({
        rule: `typecheck/TS${global[2]}`,
        file: 'tsconfig.json',
        line: 1,
        column: 1,
        severity: global[1] === 'warning' ? 'warning' : 'error',
        message: global[3] ?? '',
      });
    else if (diagnostics.length > 0) {
      const previous = diagnostics.pop();
      if (previous) diagnostics.push({ ...previous, message: `${previous.message}\n${line}` });
    }
  }
  return diagnostics;
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
