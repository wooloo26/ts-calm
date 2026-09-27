import { helpForRule, documentationFor } from '#src/rules/help';
import { enabled } from '#src/core/configuration';
import { diagnostic } from '#src/core/diagnostics';
import type { AnalyzedFile, CheckConfig, Diagnostic } from '#src/core/types';
import { allowed } from '#src/rules/allow';

export const checkStrictFp = (
  file: AnalyzedFile,
  config: CheckConfig,
  allowances: ReadonlySet<string>,
): readonly Diagnostic[] => {
  if (!enabled('strict-fp', file.source.path, config)) return [];
  const setting = config.rules?.['strict-fp'];
  const options = typeof setting === 'object' ? setting : {};
  const diagnostics: Diagnostic[] = [];
  for (const fact of file.parsed.strict) {
    const disabled = Object.entries(options).some(
      ([name, active]) => name === fact.name && active === false,
    );
    const rule = `strict-fp/${fact.name}`;
    if (disabled || allowed(allowances, file.source, { ...fact, rule })) continue;
    const help = helpForRule(rule);
    diagnostics.push({
      ...diagnostic(file.source, rule, {
        message: `Forbidden ${fact.name}.`,
        offset: fact.offset,
      }),
      ...(help ? { help: help.summary, docs: documentationFor(rule) } : {}),
    });
  }
  return diagnostics;
};
