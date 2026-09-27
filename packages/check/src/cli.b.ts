#!/usr/bin/env node
/**
 * @boundary Adapt process input and files to Result-based commands, then print one response and exit status.
 * @effects process
 * @effects console
 * @effects node:fs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { err, get, getError, isErr, map, ok } from '@ts-calm/fp';
import type { AsyncResult, Unit } from '@ts-calm/fp';
import { capture, captureResultAsync } from '@ts-calm/fp/boundary';
import { checkProject } from '#src/project';
import { checkStaged, checkStagedMessage } from '#src/staged.b';
import { explainRule, helpForRule } from '#src/rules/help';
import { parseCommand, diagnosticOutput, initializationOutput, usage } from '#src/cli';
import type { Command, CommandOutput } from '#src/cli';
import { failureMessage, issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';
import { decodeManifest } from '#src/manifest';

/** @impure Read files and execute the selected command. */
const execute = async (command: Command): AsyncResult<CommandOutput, CheckFailure> => {
  const { root, json, kind } = command;
  if (kind === 'help') return ok({ text: usage, exitCode: 0 });
  if (kind === 'version') {
    const text = capture(() => readFileSync(new URL('../package.json', import.meta.url), 'utf8'), {
      name: 'read-tool-version',
    });
    if (isErr(text)) return text;
    const manifest = decodeManifest(get(text));
    return map(manifest, (value) => ({
      text: typeof value['version'] === 'string' ? value['version'] : '0.0.0',
      exitCode: 0 as const,
    }));
  }
  if (kind === 'init')
    return map(await (await import('#src/init.b')).initializeProject(root), (value) =>
      initializationOutput(value, json),
    );
  if (kind === 'explain') {
    const help = helpForRule(command.rule);
    return help
      ? ok({
          text: json ? JSON.stringify({ rule: command.rule, ...help }) : explainRule(command.rule),
          exitCode: 0,
        })
      : err(issue('invalid-arguments', 'explain-rule', `Unknown rule ${command.rule}.`));
  }
  if (kind === 'check')
    return map(await (command.staged ? checkStaged(root) : checkProject(root)), (value) =>
      diagnosticOutput(value, json),
    );
  if (kind === 'typecheck')
    return map((await import('#src/typecheck.b')).typecheckProject(root), (value) =>
      diagnosticOutput(value, json),
    );
  const message = capture(
    /** @impure Read the supplied commit message file. */ () =>
      readFileSync(resolve(root, command.file), 'utf8'),
    {
      name: 'read-commit-message',
    },
  );
  return isErr(message)
    ? message
    : map(await checkStagedMessage(root, get(message)), (value) => diagnosticOutput(value, json));
};

/** @impure Read process state and render one successful command response. */
const main = async (): AsyncResult<Unit, CheckFailure> => {
  const parsed = parseCommand(process.argv.slice(2), process.cwd());
  if (isErr(parsed)) return parsed;
  const result = await execute(get(parsed));
  if (isErr(result)) return result;
  const output = get(result);
  console.log(output.text);
  process.exitCode = output.exitCode;
  return ok();
};

const outcome = await captureResultAsync(main, { name: 'cli' });
if (isErr(outcome)) {
  const message = failureMessage(getError(outcome));
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ error: { kind: 'operational', message } }));
  else console.error(message);
  process.exitCode = 2;
}
