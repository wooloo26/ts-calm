import { diagnostic } from './diagnostics.ts';
import type { Diagnostic, GateConfiguration } from './types.ts';

export const validateCommitMessage = (
  message: string,
  config: GateConfiguration = {},
  file = 'COMMIT_EDITMSG',
): readonly Diagnostic[] => {
  const setting = config.rules?.['commit-message'];
  if (setting === false) return [];
  const options = typeof setting === 'object' ? setting : {};
  const source = { path: file, content: message };
  const diagnostics: Diagnostic[] = [];
  const offset = [...message].findIndex((character) => character.charCodeAt(0) > 127);
  if (options.ascii !== false && offset >= 0)
    diagnostics.push(
      diagnostic(
        source,
        'commit-message/ascii',
        'Use ASCII in the subject, body and trailers.',
        offset,
      ),
    );
  const first = message.split(/\r?\n/)[0] ?? '';
  const match =
    /^(feat|fix|refactor|test|docs|chore|build|ci|perf|revert)\(([a-z][a-z0-9-]*)\)(!)?: (\S.*)$/.exec(
      first,
    );
  if (!match || first.length > (options.maxLength ?? 100))
    diagnostics.push(
      diagnostic(
        source,
        'commit-message/format',
        `Expected type(scope): description, at most ${options.maxLength ?? 100} characters.`,
      ),
    );
  else if (options.scopes && !options.scopes.includes(match[2] ?? ''))
    diagnostics.push(
      diagnostic(source, 'commit-message/scope', `Allowed scopes: ${options.scopes.join(', ')}.`),
    );
  return diagnostics;
};
