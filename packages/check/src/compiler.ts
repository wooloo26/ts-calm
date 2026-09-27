import { get, isArray, isErr, isPlainObject, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { capture } from '@ts-calm/fp/boundary';
import type { CheckFailure } from '#src/core/issues';
import type { Diagnostic } from '#src/core/types';

export const compilerConditionsFromOutput = (
  output: string,
): Result<readonly string[], CheckFailure> => {
  const parsed = capture((): unknown => JSON.parse(output), {
    name: 'decode-typescript-configuration',
  });
  if (isErr(parsed)) return parsed;
  const data = get(parsed);
  const options =
    isPlainObject(data) && isPlainObject(data['compilerOptions']) ? data['compilerOptions'] : {};
  const conditions = options['customConditions'];
  return ok(
    isArray(conditions)
      ? conditions.filter((item): item is string => typeof item === 'string')
      : [],
  );
};
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
