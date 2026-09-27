import { diagnostic } from '#src/core/diagnostics';
import { allowed } from '#src/rules/allow';
import { documentationFor, functionParamsHelp } from '#src/rules/help';
import type { Allowances } from '#src/rules/allow';
import type { AnalyzedFile, Diagnostic } from '#src/core/types';

export function checkFunctionParams(
  { source, parsed }: AnalyzedFile,
  allowances: Allowances,
): readonly Diagnostic[] {
  const rule = 'function-params';
  return parsed.signatures
    .filter((fact) => fact.parameters > 3 && !allowed(allowances, source, { ...fact, rule }))
    .map((fact) => ({
      ...diagnostic(source, rule, {
        message: `Signature has ${fact.parameters} parameters (maximum 3).`,
        offset: fact.offset,
      }),
      help: functionParamsHelp.summary,
      docs: documentationFor(rule),
    }));
}
