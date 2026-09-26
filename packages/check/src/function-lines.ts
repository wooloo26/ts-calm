import type { FunctionFact, SourceComment } from '#src/types';

/** Effective body lines at which a function is reported as a warning. */
export const functionWarningLines = 80;
/** Effective body lines above which a function is an error. */
export const functionMaximumLines = 150;
const allowanceMarker = 'calm-allow-next-function';

export type FunctionAllowance = Readonly<{
  target: string;
  reason: string;
  comment: SourceComment;
  offset: number;
}>;

export const maskedSource = (source: string, comments: readonly SourceComment[]): string => {
  if (comments.length === 0) return source;
  const pieces: string[] = [];
  let cursor = 0;
  for (const comment of [...comments].toSorted((left, right) => left.start - right.start)) {
    if (comment.start < cursor) continue;
    pieces.push(source.slice(cursor, comment.start));
    pieces.push(source.slice(comment.start, comment.end).replace(/[^\n]/g, ' '));
    cursor = comment.end;
  }
  pieces.push(source.slice(cursor));
  return pieces.join('');
};

const countContentLines = (text: string): number => {
  let count = 0;
  for (const line of text.split('\n')) if (line.trim() !== '') count += 1;
  return count;
};

/** The body range that belongs to the function itself, excluding its own braces. */
const bodyRange = (fact: FunctionFact): Readonly<{ start: number; end: number }> =>
  fact.bodyBlock
    ? { start: fact.bodyStart + 1, end: fact.bodyEnd - 1 }
    : { start: fact.bodyStart, end: fact.bodyEnd };

export const effectiveLineCount = (
  masked: string,
  fact: FunctionFact,
  functions: readonly FunctionFact[],
): number => {
  const range = bodyRange(fact);
  const nested = functions
    .filter(
      (other) =>
        other.start !== fact.start && other.bodyStart >= range.start && other.bodyEnd <= range.end,
    )
    .toSorted((left, right) => left.bodyStart - right.bodyStart);
  const pieces: string[] = [];
  let cursor = range.start;
  for (const other of nested) {
    if (other.bodyStart < cursor) continue;
    pieces.push(masked.slice(cursor, other.bodyStart));
    pieces.push(masked.slice(other.bodyStart, other.bodyEnd).replace(/[^\n]/g, ' '));
    cursor = other.bodyEnd;
  }
  pieces.push(masked.slice(cursor, range.end));
  return countContentLines(pieces.join(''));
};

export const mentionsAllowance = (comment: SourceComment): boolean =>
  comment.text.includes(allowanceMarker);

export const parseAllowance = (comment: SourceComment): FunctionAllowance => {
  const normalized = comment.text
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd())
    .join('\n')
    .trim();
  const match = new RegExp(`^${allowanceMarker}(?:\\s+(\\S+))?\\s*(?:--\\s*([\\s\\S]*))?$`).exec(
    normalized,
  );
  return {
    target: match?.[1] ?? '',
    reason: (match?.[2] ?? '').trim(),
    comment,
    offset: comment.start,
  };
};
