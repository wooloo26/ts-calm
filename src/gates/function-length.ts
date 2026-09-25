import {
  effectiveLineCount,
  maskedSource,
  mentionsAllowance,
  parseAllowance,
} from './function-lines.ts';
import { diagnostic } from './diagnostics.ts';
import type { AnalyzedFile, Diagnostic, GateConfiguration } from './types.ts';

export const checkFunctionLength = (
  { source, parsed }: AnalyzedFile,
  config: GateConfiguration = {},
): readonly Diagnostic[] => {
  const setting = config.rules?.['function-length'];
  const options = typeof setting === 'object' ? setting : {};
  const warning = options.warning ?? 80,
    maximum = options.maximum ?? 150;
  const masked = maskedSource(source.content, parsed.comments);
  const diagnostics: Diagnostic[] = [];
  const allowances = new Map<number, number>();
  const report = (name: string, message: string, offset: number): void => {
    diagnostics.push(diagnostic(source, `function-length/${name}`, message, offset));
  };
  for (const comment of parsed.comments.filter(mentionsAllowance)) {
    const allowance = parseAllowance(comment);
    const target = parsed.functions.find((fact) => fact.start >= comment.end);
    // Only declaration keywords/bindings may occur before the function expression.
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
        'Use gate-allow-next-function function-length -- concrete reason.',
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
      diagnostic(
        source,
        'function-length',
        `Function ${fact.name} has ${lines} effective lines (warning above ${warning}, maximum ${maximum}).`,
        fact.start,
        lines > maximum ? 'error' : 'warning',
      ),
    );
  }
  return diagnostics;
};
