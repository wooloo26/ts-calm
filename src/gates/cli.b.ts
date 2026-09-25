#!/usr/bin/env node
/**
 * @boundary Adapt command-line arguments, files and exit status to the reusable gate API.
 * @effects process
 * @effects console
 * @effects node:fs
 * @allow strict-fp/no-try -- Convert operational failures to exit code 2 with an actionable message.
 * @allow strict-fp/no-throw -- Invalid CLI arguments are operational errors caught by main.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProject } from './project.b.ts';
import { checkStaged, checkStagedMessage } from './staged.b.ts';
import { formatDiagnostics } from './diagnostics.ts';
import type { Diagnostic } from './types.ts';

const usage =
  'fp-gates check [--staged] [--json] [--cwd <directory>]\nfp-gates commit-message --file <path> [--json] [--cwd <directory>]';
const main = (): void => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  if (args.length === 1 && args[0] === '--version') {
    console.log('0.1.0');
    return;
  }
  const command = args.shift();
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
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      if (argument === '--cwd') root = resolve(value);
      else file = value;
    } else throw new Error(`Unknown argument ${argument}.\n${usage}`);
  }
  let diagnostics: readonly Diagnostic[];
  if (command === 'check') diagnostics = staged ? checkStaged(root) : checkProject(root);
  else if (command === 'commit-message' && file)
    diagnostics = checkStagedMessage(root, readFileSync(resolve(root, file), 'utf8'));
  else throw new Error(usage);
  console.log(
    json ? JSON.stringify(diagnostics) : formatDiagnostics(diagnostics) || 'All gates passed.',
  );
  process.exitCode = diagnostics.some((item) => item.severity === 'error') ? 1 : 0;
};

try {
  main();
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Gate execution failed.');
  process.exitCode = 2;
}
