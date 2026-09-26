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
import { checkProject } from '#src/project';
import { explainRule, helpForRule } from '#src/rule-help';
import { checkStaged, checkStagedMessage } from '#src/staged.b';
import { formatDiagnostics } from '#src/diagnostics';
import type { Diagnostic } from '#src/types';

const usage =
  'ts-calm check [--staged] [--json] [--cwd <directory>]\nts-calm typecheck [--json] [--cwd <directory>]\nts-calm init [--template pnpm-turbo] [--json] [--cwd <directory>]\nts-calm explain <rule> [--json]\nts-calm commit-message --file <path> [--json] [--cwd <directory>]';
/** @impure Read CLI arguments, execute commands and write output or exit status. */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
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
    return;
  }
  const command = args.shift();
  const rule = command === 'explain' ? (args.shift() ?? '') : '';
  let root = process.cwd(),
    file = '',
    staged = false,
    json = false,
    template = '';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') json = true;
    else if (argument === '--staged' && command === 'check') staged = true;
    else if (
      argument === '--cwd' ||
      (argument === '--file' && command === 'commit-message') ||
      (argument === '--template' && command === 'init')
    ) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      if (argument === '--cwd') root = resolve(value);
      else if (argument === '--template') template = value;
      else file = value;
    } else throw new Error(`Unknown argument ${argument}.\n${usage}`);
  }
  if (command === 'init') {
    if (template && template !== 'pnpm-turbo') throw new Error(`Unknown template ${template}.`);
    // Loaded on demand: checking, explaining and commit-message never need a formatter or generator.
    const result = template
      ? await (await import('@ts-calm/create-template')).initializeWorkspace(root)
      : await (await import('#src/init.b')).initializeProject(root);
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
  if (command === 'check')
    diagnostics = staged ? await checkStaged(root) : await checkProject(root);
  else if (command === 'typecheck')
    diagnostics = (await import('#src/typecheck.b')).typecheckProject(root);
  else if (command === 'commit-message' && file)
    diagnostics = await checkStagedMessage(root, readFileSync(resolve(root, file), 'utf8'));
  else throw new Error(usage);
  console.log(
    json ? JSON.stringify(diagnostics) : formatDiagnostics(diagnostics) || 'All checks passed.',
  );
  process.exitCode = diagnostics.some((item) => item.severity === 'error') ? 1 : 0;
};

try {
  await main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : 'Check execution failed.';
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ error: { kind: 'operational', message } }));
  else console.error(message);
  process.exitCode = 2;
}
