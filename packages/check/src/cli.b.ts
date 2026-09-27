#!/usr/bin/env node
/**
 * @boundary Adapt command-line arguments, files and exit status to the reusable check API.
 * @effects process
 * @effects console
 * @effects node:fs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProject } from '#src/project';
import { explainRule, helpForRule } from '#src/rules/help';
import { checkStaged, checkStagedMessage } from '#src/staged.b';
import { formatDiagnostics } from '#src/core/diagnostics';
import { err, getError, isErr, ok } from '@ts-calm/fp';
import type { Result, Unit } from '@ts-calm/fp';
import { captureResultAsync } from '@ts-calm/fp/boundary';
import type { Diagnostic } from '#src/core/types';

const usage =
  'ts-calm check [--staged] [--json] [--cwd <directory>]\nts-calm typecheck [--json] [--cwd <directory>]\nts-calm init [--json] [--cwd <directory>]\nts-calm explain <rule> [--json]\nts-calm commit-message --file <path> [--json] [--cwd <directory>]';
/** @impure Read CLI arguments, execute commands and write output or exit status. */
const main = async (): Promise<Result<Unit, string>> => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return ok();
  }
  if (args.length === 1 && args[0] === '--version') {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    console.log(
      typeof manifest === 'object' && manifest && 'version' in manifest
        ? String(manifest.version)
        : '0.0.0',
    );
    return ok();
  }
  const command = args.shift();
  const rule = command === 'explain' ? (args.shift() ?? '') : '';
  let root = process.cwd(),
    file = '',
    staged = false,
    json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') json = true;
    else if (argument === '--staged' && command === 'check') staged = true;
    else if (argument === '--cwd' || (argument === '--file' && command === 'commit-message')) {
      const value = args[++index];
      if (!value || value.startsWith('--')) return err(`Missing value for ${argument}.`);
      if (argument === '--cwd') root = resolve(value);
      else file = value;
    } else return err(`Unknown argument ${argument}.\n${usage}`);
  }
  if (command === 'init') {
    const result = await (await import('#src/init.b')).initializeProject(root);
    console.log(
      json
        ? JSON.stringify(result)
        : [
            `Created: ${result.created.join(', ') || 'none'}`,
            `Updated: ${result.updated.join(', ') || 'none'}`,
            ...result.warnings,
          ].join('\n'),
    );
    return ok();
  }
  if (command === 'explain') {
    const help = helpForRule(rule);
    if (!help) return err(`Unknown rule ${rule}.`);
    console.log(json ? JSON.stringify({ rule, ...help }) : explainRule(rule));
    return ok();
  }
  let diagnostics: readonly Diagnostic[];
  if (command === 'check')
    diagnostics = staged ? await checkStaged(root) : await checkProject(root);
  else if (command === 'typecheck')
    diagnostics = (await import('#src/typecheck.b')).typecheckProject(root);
  else if (command === 'commit-message' && file)
    diagnostics = await checkStagedMessage(root, readFileSync(resolve(root, file), 'utf8'));
  else return err(usage);
  console.log(
    json ? JSON.stringify(diagnostics) : formatDiagnostics(diagnostics) || 'All checks passed.',
  );
  process.exitCode = diagnostics.some((item) => item.severity === 'error') ? 1 : 0;
  return ok();
};

const outcome = await captureResultAsync(main, { name: 'cli' });
if (isErr(outcome)) {
  const problem = getError(outcome);
  const message =
    typeof problem === 'string'
      ? problem
      : problem.cause instanceof Error
        ? problem.cause.message
        : 'Check execution failed.';
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ error: { kind: 'operational', message } }));
  else console.error(message);
  process.exitCode = 2;
}
