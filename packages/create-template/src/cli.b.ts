#!/usr/bin/env node
/**
 * @boundary Adapt command-line arguments, files and exit status to the workspace generator.
 * @effects process
 * @effects console
 * @allow strict-fp/no-try -- Convert operational failures to exit code 2 with an actionable message.
 * @allow strict-fp/no-throw -- Invalid CLI arguments are operational errors caught by main.
 */
import { initializeWorkspace } from './workspace.b.ts';

const usage = 'ts-calm-workspace [directory] [--json]';
/** @impure Create the workspace and report the created files or a failure. */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }
  const json = args.includes('--json');
  const directory = args.find((argument) => argument !== '--json') ?? '.';
  if (directory.startsWith('--')) throw new Error(`Unknown argument ${directory}.\n${usage}`);
  const result = await initializeWorkspace(directory);
  console.log(
    json
      ? JSON.stringify(result)
      : [
          `Created: ${result.created.join(', ') || 'none'}`,
          `Updated: ${result.updated.join(', ') || 'none'}`,
          ...result.warnings,
        ].join('\n'),
  );
};

try {
  await main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : 'Workspace creation failed.';
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ error: { kind: 'operational', message } }));
  else console.error(message);
  process.exitCode = 2;
}
