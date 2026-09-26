import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const packages = ['fp', 'check'] as const;
const forbidden = ['oxfmt', 'oxlint', 'oxlint-tsgolint'] as const;
const sections = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const manifest = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repository, 'packages', name, 'package.json'), 'utf8'));

describe('workspace packages', () => {
  it('declares no formatter, linter or compiler preset', () => {
    for (const name of packages) {
      const declared = manifest(name);
      for (const section of sections) {
        const entries = declared[section] as Record<string, string> | undefined;
        const names = Object.keys(entries ?? {});
        for (const tool of forbidden) expect(names, `${name} ${section}`).not.toContain(tool);
      }
      const exported = Object.keys((declared['exports'] as Record<string, unknown>) ?? {});
      for (const subpath of exported)
        expect(subpath, `${name} exports`).not.toMatch(/oxlint|oxfmt|tsconfig/u);
    }
  });
});
