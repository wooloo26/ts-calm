import type { Diagnostic, SourceFile } from './types.ts';

export const diagnostic = (
  source: SourceFile,
  rule: string,
  message: string,
  offset = 0,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic => {
  const before = source.content.slice(0, offset);
  return {
    rule,
    file: source.path,
    line: before.split('\n').length,
    column: offset - before.lastIndexOf('\n'),
    severity,
    message,
  };
};

export const formatDiagnostics = (diagnostics: readonly Diagnostic[]): string =>
  diagnostics
    .map(
      (item) =>
        `${item.file}:${item.line}:${item.column} ${item.severity} ${item.rule}: ${item.message}`,
    )
    .join('\n');
