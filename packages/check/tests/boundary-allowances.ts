import { describe, expect, it } from 'vitest';
import { analyzeSources, runChecks } from '@ts-calm/check';
import type { CheckConfig } from '@ts-calm/check';

const header = (tags: readonly string[]): string =>
  ['/**', ' * @boundary Read the external file.', ...tags, ' */'].join('\n') + '\n';

const usesFileAndClock =
  'import {readFileSync} from "node:fs";\n' +
  'export function f(){try{return [readFileSync("a"), Date.now()]}catch{return []}}';
const usesFileOnly =
  'import {readFileSync} from "node:fs";\n' +
  'export function f(){try{return readFileSync("a")}catch{return ""}}';
const usesClockOnly = 'export function f(){try{return Date.now()}catch{return 0}}';
const rejectsWithoutAllowance =
  'import {readFileSync} from "node:fs";\n' +
  'export function f(){try{if(!Date.now()) throw new Error("x"); return readFileSync("a")}catch{return ""}}';

const lint = (content: string, config: CheckConfig = {}): readonly string[] => {
  const files = [{ path: 'src/a.b.ts', content }];
  const imports = analyzeSources({ files }, config).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: 'src/a.b.ts',
      imported,
      target: { kind: 'external' as const },
    })),
  );
  return runChecks({ files, imports }, config).map((issue) => issue.rule);
};

const declaredAndAllowed = header([
  ' * @effects node:fs',
  ' * @allow strict-fp/no-try -- Convert filesystem failures here.',
]);

describe('boundary allowances next to other boundary diagnostics', () => {
  it('keeps a declared allowance when another effect is undeclared', () => {
    const rules = lint(declaredAndAllowed + usesFileAndClock);
    expect(rules).toContain('boundary/undeclared');
    expect(rules).not.toContain('strict-fp/no-try');
  });
  it('keeps the allowance when the boundary rule itself is disabled', () => {
    const rules = lint(declaredAndAllowed + usesFileAndClock, { rules: { boundary: false } });
    expect(rules).not.toContain('strict-fp/no-try');
  });
  it('still reports syntax the file never declared an allowance for', () => {
    const rules = lint(declaredAndAllowed + rejectsWithoutAllowance);
    expect(rules).toContain('boundary/undeclared');
    expect(rules).toContain('strict-fp/no-throw');
    expect(rules).not.toContain('strict-fp/no-try');
  });
  it('does not extend an allowance to a different check', () => {
    const rules = lint(header([' * @allow strict-fp/no-null -- Unrelated.']) + usesClockOnly);
    expect(rules).toContain('strict-fp/no-try');
    expect(rules).toContain('boundary/unused');
  });
  it('keeps a malformed allowance ineffective', () => {
    const rules = lint(header([' * @allow strict-fp/no-try']) + usesFileOnly);
    expect(rules).toContain('boundary/allow');
    expect(rules).toContain('strict-fp/no-try');
  });
  it('keeps a blanket allowance working without an @effects declaration', () => {
    const rules = lint(
      header([' * @allow strict-fp/* -- Adapt the whole adapter.']) + usesClockOnly,
    );
    expect(rules).not.toContain('strict-fp/no-try');
  });
  it('reports an undeclared effect even when every strict-fp check is allowed', () => {
    const rules = lint(
      header([' * @allow strict-fp/* -- Adapt the whole adapter.']) + usesFileAndClock,
    );
    expect(rules).toContain('boundary/undeclared');
  });
});
