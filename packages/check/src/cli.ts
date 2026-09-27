import { err, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { resolve } from 'node:path';
import { issue } from '#src/core/issues';
import type { CheckIssue } from '#src/core/issues';
import type { Diagnostic } from '#src/core/types';
import { formatDiagnostics } from '#src/core/diagnostics';
import type { InitResult } from '#src/manifest';

export const usage =
  'ts-calm check [--staged] [--json] [--cwd <directory>]\nts-calm typecheck [--json] [--cwd <directory>]\nts-calm init [--json] [--cwd <directory>]\nts-calm explain <rule> [--json]\nts-calm commit-message --file <path> [--json] [--cwd <directory>]';
export type Command = Readonly<{
  kind: 'help' | 'version' | 'check' | 'typecheck' | 'init' | 'explain' | 'commit-message';
  root: string;
  file: string;
  rule: string;
  staged: boolean;
  json: boolean;
}>;
export type CommandOutput = Readonly<{ text: string; exitCode: 0 | 1 }>;
const invalid = (message: string): Result<never, CheckIssue> =>
  err(issue('invalid-arguments', 'parse-command', message));

/** Interpret arguments without reading process state or executing a command. */
export const parseCommand = (
  input: readonly string[],
  cwd: string,
): Result<Command, CheckIssue> => {
  const empty = { root: cwd, file: '', rule: '', staged: false, json: false };
  if (input.includes('--help') || input.includes('-h')) return ok({ ...empty, kind: 'help' });
  if (input.length === 1 && input[0] === '--version') return ok({ ...empty, kind: 'version' });
  const args = [...input],
    kind = args.shift();
  if (
    kind !== 'check' &&
    kind !== 'typecheck' &&
    kind !== 'init' &&
    kind !== 'explain' &&
    kind !== 'commit-message'
  )
    return invalid(usage);
  let command: Command = { ...empty, kind, rule: kind === 'explain' ? (args.shift() ?? '') : '' };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') command = { ...command, json: true };
    else if (argument === '--staged' && kind === 'check') command = { ...command, staged: true };
    else if (argument === '--cwd' || (argument === '--file' && kind === 'commit-message')) {
      const value = args[++index];
      if (!value || value.startsWith('--')) return invalid(`Missing value for ${argument}.`);
      command =
        argument === '--cwd'
          ? { ...command, root: resolve(cwd, value) }
          : { ...command, file: value };
    } else return invalid(`Unknown argument ${argument}.\n${usage}`);
  }
  return kind === 'commit-message' && !command.file ? invalid(usage) : ok(command);
};
export const diagnosticOutput = (
  diagnostics: readonly Diagnostic[],
  json: boolean,
): CommandOutput => ({
  text: json ? JSON.stringify(diagnostics) : formatDiagnostics(diagnostics) || 'All checks passed.',
  exitCode: diagnostics.some((item) => item.severity === 'error') ? 1 : 0,
});
export const initializationOutput = (result: InitResult, json: boolean): CommandOutput => ({
  text: json
    ? JSON.stringify(result)
    : [
        `Created: ${result.created.join(', ') || 'none'}`,
        `Updated: ${result.updated.join(', ') || 'none'}`,
        ...result.warnings,
      ].join('\n'),
  exitCode: 0,
});
