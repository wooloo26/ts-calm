import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderRuleGuide } from '#src/rules/help';

describe('rule guide', () => {
  it('keeps docs/rules.md in step with the rule help', () => {
    const guide = readFileSync(new URL('../../../docs/rules.md', import.meta.url), 'utf8');
    expect(guide).toBe(renderRuleGuide());
  });
});
