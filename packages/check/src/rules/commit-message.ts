import { diagnostic } from '#src/core/diagnostics';
import type { Diagnostic, CheckConfig } from '#src/core/types';

export const validateCommitMessage = (
  message: string,
  config: CheckConfig = {},
  file = 'COMMIT_EDITMSG',
): readonly Diagnostic[] => {
  const setting = config.rules?.['commit-message'];
  if (setting === false) return [];
  const options = typeof setting === 'object' ? setting : {};
  const source = { path: file, content: message };
  const diagnostics: Diagnostic[] = [];
  const offset = message.split('').findIndex((character) => character.charCodeAt(0) > 127);
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
  const match = /^([a-z][a-z0-9-]*) - (\S.*)$/.exec(first);
  if (!match || first.length > (options.maxLength ?? 100))
    diagnostics.push(
      diagnostic(
        source,
        'commit-message/format',
        `Expected scope - description, at most ${options.maxLength ?? 100} characters.`,
      ),
    );
  else if (options.scopes && !options.scopes.includes(match[1] ?? ''))
    diagnostics.push(
      diagnostic(source, 'commit-message/scope', `Allowed scopes: ${options.scopes.join(', ')}.`),
    );
  return diagnostics;
};
