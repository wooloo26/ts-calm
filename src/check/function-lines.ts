import type { FunctionFact, SourceComment } from './types.ts';

export const functionWarningLines = 80;
export const functionMaximumLines = 150;
export const functionLengthRule = 'function-length';
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

export const lineAt = (text: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < Math.min(offset, text.length); index += 1)
    if (text.charCodeAt(index) === 10) line += 1;
  return line;
};

const countContentLines = (text: string): number => {
  let count = 0;
  for (const line of text.split('\n')) if (line.trim() !== '') count += 1;
  return count;
};

export const effectiveLineCount = (
  masked: string,
  fact: FunctionFact,
  functions: readonly FunctionFact[],
): number => {
  const nested = functions
    .filter(
      (other) =>
        other.start !== fact.start &&
        other.bodyStart >= fact.bodyStart &&
        other.bodyEnd <= fact.bodyEnd,
    )
    .toSorted((left, right) => left.bodyStart - right.bodyStart);
  if (nested.length === 0) return countContentLines(masked.slice(fact.bodyStart, fact.bodyEnd));
  const segments: string[] = [];
  let cursor = fact.bodyStart;
  for (const other of nested) {
    if (other.bodyStart < cursor) continue;
    segments.push(masked.slice(cursor, other.bodyStart));
    segments.push(masked.slice(other.bodyStart, other.bodyEnd).replace(/[^\n]/g, ' '));
    cursor = other.bodyEnd;
  }
  segments.push(masked.slice(cursor, fact.bodyEnd));
  return countContentLines(segments.join(''));
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
