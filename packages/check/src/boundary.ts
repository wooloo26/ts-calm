import { diagnostic } from '#src/diagnostics';
import { strictChecks } from '#src/types';
import type { AnalyzedFile, Diagnostic } from '#src/types';

type Declaration = Readonly<{ tag: string; value: string; offset: number }>;
export type BoundaryAnalysis = Readonly<{
  diagnostics: readonly Diagnostic[];
  allowances: ReadonlySet<string>;
}>;

const declarations = ({ source, parsed }: AnalyzedFile): readonly Declaration[] => {
  const output: Declaration[] = [];
  let cursor = source.content.startsWith('#!') ? source.content.indexOf('\n') + 1 : 0;
  for (const comment of parsed.comments) {
    if (source.content.slice(cursor, comment.start).trim()) break;
    cursor = comment.end;
    for (const line of comment.text.split(/\r?\n/)) {
      const clean = line.replace(/^\s*\*?\s?/, '').trim();
      const match = /^@(\S+)(?:\s+(.*))?$/.exec(clean);
      if (match) output.push({ tag: match[1] ?? '', value: match[2] ?? '', offset: comment.start });
      else if (clean && output.length > 0) {
        const previous = output.pop();
        if (previous) output.push({ ...previous, value: `${previous.value} ${clean}` });
      }
    }
    if (output.some((entry) => entry.tag === 'boundary')) break;
  }
  return output;
};

export const analyzeBoundary = (file: AnalyzedFile): BoundaryAnalysis => {
  const { source, parsed } = file;
  const tags = declarations(file);
  const diagnostics: Diagnostic[] = [];
  const allowances = new Set<string>();
  const suffix = source.path.endsWith('.b.ts');
  /** @impure Append a diagnostic to the current analysis result. */
  const report = (name: string, message: string, offset = 0): void => {
    diagnostics.push(diagnostic(source, `boundary/${name}`, message, offset));
  };
  if (!suffix) {
    for (const effect of parsed.effects)
      report(
        'effect',
        `${effect.name} must be isolated in a documented .b.ts implementation.`,
        effect.offset,
      );
    if (tags.some((tag) => ['boundary', 'effects', 'allow'].includes(tag.tag)))
      report('suffix', 'Boundary declarations only belong in .b.ts files.');
    return { diagnostics, allowances };
  }
  const reasons = tags.filter((tag) => tag.tag === 'boundary');
  if (reasons.length !== 1 || !reasons[0]?.value.trim())
    report(
      'reason',
      'Provide exactly one leading @boundary reason describing the external adaptation and guarantee.',
    );
  const observed = new Set(parsed.effects.map((effect) => effect.name));
  const declared = new Set<string>();
  for (const tag of tags) {
    if (tag.tag === 'boundary' || tag.tag === 'impure') continue;
    if (tag.tag === 'effects') {
      if (!tag.value || /\s|\*/.test(tag.value))
        report('declaration', '@effects requires one exact module or API name.', tag.offset);
      if (declared.has(tag.value))
        report('duplicate', `Duplicate effect ${tag.value}.`, tag.offset);
      declared.add(tag.value);
      if (!observed.has(tag.value))
        report('unused', `Effect ${tag.value} is not used; remove the declaration.`, tag.offset);
      continue;
    }
    if (tag.tag !== 'allow') {
      report('tag', `Unknown boundary tag @${tag.tag}.`, tag.offset);
      continue;
    }
    const match = /^strict-fp\/(\S+)\s+--\s+(\S[\s\S]*)$/.exec(tag.value);
    const check = match?.[1] ?? '';
    if (!match || (check !== '*' && !strictChecks.some((name) => name === check))) {
      report(
        'allow',
        'Use @allow strict-fp/<check> -- reason, or strict-fp/* -- reason.',
        tag.offset,
      );
      continue;
    }
    if (allowances.has(check) || allowances.has('*') || (check === '*' && allowances.size > 0))
      report('duplicate', `Overlapping allowance ${check}.`, tag.offset);
    if (!parsed.strict.some((fact) => check === '*' || fact.name === check))
      report('unused', `Allowance ${check} has no corresponding syntax; remove it.`, tag.offset);
    allowances.add(check);
  }
  for (const effect of parsed.effects)
    if (!declared.has(effect.name))
      report('undeclared', `Declare @effects ${effect.name}.`, effect.offset);
  const actualAllowance = parsed.strict.some(
    (fact) => allowances.has('*') || allowances.has(fact.name),
  );
  if (!parsed.hasImplementation || (observed.size === 0 && !actualAllowance))
    report(
      'purpose',
      'No direct effect or concrete adaptation justifies .b.ts; use an ordinary source file.',
    );
  return { diagnostics, allowances };
};
