import { isArray, isObject, hasOwn } from '../fp/guards.ts';
import type { Diagnostic } from './types.ts';

const text = (value: unknown, key: string): string =>
  hasOwn(value, key) && typeof value[key] === 'string' ? value[key] : '';
const numeric = (value: unknown, key: string): number =>
  hasOwn(value, key) && typeof value[key] === 'number' ? value[key] : 1;
const field = (value: unknown, key: string): unknown => (hasOwn(value, key) ? value[key] : {});

/** The two overlapping syntax checks are owned by strict-fp, including its scoped exceptions. */
export const lintDiagnostics = (
  input: unknown,
  normalize: (file: string) => string,
): readonly Diagnostic[] => {
  const values = field(input, 'diagnostics');
  if (!isArray(values)) return [];
  return values.flatMap((value) => {
    const code = text(value, 'code');
    if (['typescript(no-explicit-any)', 'typescript(no-non-null-assertion)'].includes(code))
      return [];
    const labels = field(value, 'labels');
    const span = isArray(labels) ? field(labels[0], 'span') : {};
    const help = text(value, 'help'),
      docs = text(value, 'url');
    return [
      {
        rule: `lint/${code || 'diagnostic'}`,
        file: normalize(text(value, 'filename') || '<lint>'),
        line: numeric(span, 'line'),
        column: numeric(span, 'column'),
        severity: text(value, 'severity') === 'warning' ? ('warning' as const) : ('error' as const),
        message: text(value, 'message'),
        ...(help ? { help } : {}),
        ...(docs ? { docs } : {}),
      },
    ];
  });
};

export const isLintReport = (input: unknown): boolean =>
  isObject(input) && hasOwn(input, 'diagnostics') && isArray(input.diagnostics);

export const typeDiagnostics = (
  output: string,
  normalize: (file: string) => string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(.*?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.*)$/.exec(line);
    const global = /^(error|warning) TS(\d+): (.*)$/.exec(line);
    if (match)
      diagnostics.push({
        rule: `typecheck/TS${match[5]}`,
        file: normalize(match[1] ?? ''),
        line: Number(match[2]),
        column: Number(match[3]),
        severity: match[4] === 'warning' ? 'warning' : 'error',
        message: match[6] ?? '',
      });
    else if (global)
      diagnostics.push({
        rule: `typecheck/TS${global[2]}`,
        file: 'tsconfig.json',
        line: 1,
        column: 1,
        severity: global[1] === 'warning' ? 'warning' : 'error',
        message: global[3] ?? '',
      });
    else if (diagnostics.length > 0) {
      const previous = diagnostics.pop();
      if (previous) diagnostics.push({ ...previous, message: `${previous.message}\n${line}` });
    }
  }
  return diagnostics;
};
