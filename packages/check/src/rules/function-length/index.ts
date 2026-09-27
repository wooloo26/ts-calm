import {
  effectiveLineCount,
  functionMaximumLines,
  functionWarningLines,
  maskedSource,
  mentionsAllowance,
  parseAllowance,
} from '#src/rules/function-length/lines';
import { diagnostic } from '#src/core/diagnostics';
import type { AnalyzedFile, Diagnostic, CheckConfig } from '#src/core/types';

export const checkFunctionLength = (
  { source, parsed }: AnalyzedFile,
  config: CheckConfig = {},
): readonly Diagnostic[] => {
  const setting = config.rules?.['function-length'];
  const options = typeof setting === 'object' ? setting : {};
  const warning = options.warning ?? functionWarningLines,
    maximum = options.maximum ?? functionMaximumLines;
  const masked = maskedSource(source.content, parsed.comments);
  const diagnostics: Diagnostic[] = [];
  const allowances = new Map<number, number>();
  /** @impure Append a diagnostic to the current function analysis. */
  const report = (name: string, message: string, offset: number): void => {
    diagnostics.push(diagnostic(source, `function-length/${name}`, { message, offset }));
  };
  for (const comment of parsed.comments.filter(mentionsAllowance)) {
    const allowance = parseAllowance(comment);
    const target = parsed.functions.find((fact) => fact.start >= comment.end);
    const gap = target ? masked.slice(comment.end, target.start).trim() : '!';
    const attached =
      target &&
      /^(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?|(?:export\s+)?(?:const|let)\s+[\w$]+(?:\s*:[^=;]+)?\s*=\s*)$/.test(
        gap,
      );
    if (!attached) {
      report('allow-orphan', 'Place the allowance immediately above its function.', comment.start);
      continue;
    }
    let valid = true;
    if (allowance.target !== 'function-length' || !allowance.reason) {
      report(
        'allow-invalid',
        'Use calm-allow-next-function function-length -- concrete reason.',
        comment.start,
      );
      valid = false;
    }
    if (allowances.has(target.start)) {
      report('allow-duplicate', 'Only one allowance may cover a function.', comment.start);
      valid = false;
    }
    if (effectiveLineCount(masked, target, parsed.functions) <= warning) {
      report('allow-stale', 'This function no longer needs an allowance.', comment.start);
      valid = false;
    }
    if (valid) allowances.set(target.start, comment.start);
  }
  for (const fact of parsed.functions) {
    const lines = effectiveLineCount(masked, fact, parsed.functions);
    if (lines <= warning || allowances.has(fact.start)) continue;
    diagnostics.push(
      diagnostic(source, 'function-length', {
        message: `Function ${fact.name} has ${lines} effective lines (warning above ${warning}, maximum ${maximum}).`,
        offset: fact.start,
        severity: lines > maximum ? 'error' : 'warning',
      }),
    );
  }
  return diagnostics;
};
