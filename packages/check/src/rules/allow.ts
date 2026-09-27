import { diagnostic } from '#src/core/diagnostics';
import { strictChecks } from '#src/core/types';
import type { AnalyzedFile, Diagnostic, SourceFile } from '#src/core/types';

export type Allowances = ReadonlySet<string>;
const lineAt = (source: SourceFile, offset: number): number =>
  source.content.slice(0, offset).split('\n').length;
const allowanceKey = (line: number, rule: string): string => `${line}:${rule}`;

export function allowed(
  allowances: Allowances,
  source: SourceFile,
  fact: Readonly<{ offset: number; rule: string }>,
): boolean {
  return allowances.has(allowanceKey(lineAt(source, fact.offset), fact.rule));
}

const ruleNames: readonly string[] = [
  ...strictChecks.map((name) => `strict-fp/${name}`),
  'function-params',
];

export function analyzeAllowances({ source, parsed }: AnalyzedFile): Readonly<{
  diagnostics: readonly Diagnostic[];
  allowances: Allowances;
}> {
  const diagnostics: Diagnostic[] = [];
  const allowances = new Set<string>();
  const lines = source.content.split(/\r?\n/);
  const comments = parsed.comments.filter((comment) => /@allow\b/.test(comment.text));
  const directives = new Map<number, Readonly<{ rule: string; offset: number }>>();
  /** @impure Append an allowance diagnostic to this analysis. */
  const report = (name: string, message: string, offset: number): void => {
    diagnostics.push(diagnostic(source, `boundary/${name}`, { message, offset }));
  };
  for (const comment of comments) {
    const line = lineAt(source, comment.start);
    const prefix = source.content.slice(
      source.content.lastIndexOf('\n', comment.start - 1) + 1,
      comment.start,
    );
    const match = /^\s*@allow\s+(\S+)\s+--\s+(\S.*?)\s*$/.exec(comment.text);
    const rule = match?.[1];
    if (!source.path.endsWith('.b.ts')) {
      report('suffix', '@allow only belongs in .b.ts files.', comment.start);
      continue;
    }
    if (
      !rule ||
      !ruleNames.includes(rule) ||
      prefix.trim() ||
      !source.content.startsWith('//', comment.start)
    ) {
      report(
        'allow',
        'Use a standalone // @allow <exact-rule> -- reason immediately above the target line.',
        comment.start,
      );
      continue;
    }
    directives.set(line, { rule, offset: comment.start });
  }
  const violations = new Set([
    ...parsed.strict.map((fact) =>
      allowanceKey(lineAt(source, fact.offset), `strict-fp/${fact.name}`),
    ),
    ...parsed.signatures
      .filter((fact) => fact.parameters > 3)
      .map((fact) => allowanceKey(lineAt(source, fact.offset), 'function-params')),
  ]);
  for (const [line, directive] of directives) {
    let target = line + 1;
    while (directives.has(target)) target += 1;
    const code = lines[target - 1]?.trim() ?? '';
    if (!code || /^\/[/*]/.test(code)) {
      report(
        'allow',
        'An allowance must immediately precede code, with no blank line or other comment.',
        directive.offset,
      );
      continue;
    }
    const key = allowanceKey(target, directive.rule);
    if (allowances.has(key)) {
      report(
        'duplicate',
        `Duplicate allowance ${directive.rule} for line ${target}.`,
        directive.offset,
      );
      continue;
    }
    if (!violations.has(key)) {
      report(
        'unused',
        `Allowance ${directive.rule} has no corresponding violation on line ${target}; remove it.`,
        directive.offset,
      );
      continue;
    }
    allowances.add(key);
  }
  return { diagnostics, allowances };
}
