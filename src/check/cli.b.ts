#!/usr/bin/env node
/**
 * @boundary Adapt command-line arguments, files and exit status to the reusable check API.
 * @effects process
 * @effects console
 * @effects node:fs
 * @allow strict-fp/no-try -- Convert operational failures to exit code 2 with an actionable message.
 * @allow strict-fp/no-throw -- Invalid CLI arguments are operational errors caught by main.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProject, checkLint } from './project.ts';
import { formatProject, typecheckProject } from './tools.b.ts';
import { initializeProject } from './init.b.ts';
import { explainRule, helpForRule } from './rule-help.ts';
import { checkStaged, checkStagedMessage } from './staged.b.ts';
import { formatDiagnostics } from './diagnostics.ts';
import type { Diagnostic } from './types.ts';

const usage =
  'ts-calm check [--staged] [--json] [--cwd <directory>]\nts-calm fmt [--check] [--json] [--cwd <directory>]\nts-calm lint | typecheck | init [--json] [--cwd <directory>]\nts-calm explain <rule> [--json]\nts-calm commit-message --file <path> [--json] [--cwd <directory>]';
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
  const rule = command === 'explain' ? (args.shift() ?? '') : '';
  let root = process.cwd(),
    file = '',
    staged = false,
    json = false,
    formatCheck = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') json = true;
    else if (argument === '--staged' && command === 'check') staged = true;
    else if (argument === '--check' && command === 'fmt') formatCheck = true;
    else if (argument === '--cwd' || (argument === '--file' && command === 'commit-message')) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      if (argument === '--cwd') root = resolve(value);
      else file = value;
    } else throw new Error(`Unknown argument ${argument}.\n${usage}`);
  }
  if (command === 'init') {
    const result = initializeProject(root);
    console.log(
      json
        ? JSON.stringify(result)
        : [
            `Created: ${result.created.join(', ') || 'none'}`,
            `Updated: ${result.updated.join(', ') || 'none'}`,
            ...result.warnings,
          ].join('\n'),
    );
    return;
  }
  if (command === 'explain') {
    const help = helpForRule(rule);
    if (!help) throw new Error(`Unknown rule ${rule}.`);
    console.log(json ? JSON.stringify({ rule, ...help }) : explainRule(rule));
    return;
  }
  let diagnostics: readonly Diagnostic[];
  if (command === 'check') diagnostics = staged ? checkStaged(root) : checkProject(root);
  else if (command === 'fmt') diagnostics = formatProject(root, formatCheck);
  else if (command === 'lint') diagnostics = checkLint(root);
  else if (command === 'typecheck') diagnostics = typecheckProject(root);
  else if (command === 'commit-message' && file)
    diagnostics = checkStagedMessage(root, readFileSync(resolve(root, file), 'utf8'));
  else throw new Error(usage);
  console.log(
    json ? JSON.stringify(diagnostics) : formatDiagnostics(diagnostics) || 'All checks passed.',
  );
  process.exitCode = diagnostics.some((item) => item.severity === 'error') ? 1 : 0;
};

try {
  main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : 'Check execution failed.';
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ error: { kind: 'operational', message } }));
  else console.error(message);
  process.exitCode = 2;
}
