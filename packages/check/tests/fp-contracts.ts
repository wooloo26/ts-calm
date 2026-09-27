import { expect, it } from 'vitest';
import * as fp from '@ts-calm/fp';
import * as boundary from '@ts-calm/fp/boundary';
import { fpContract, fpContracts, passiveFp } from '#src/rules/purity/fp-contracts';
import { analyzeSources, runChecks } from '@ts-calm/check';

it('has an explicit contract for every runtime fp export, with no stale entries', () => {
  const exported = [...new Set([...Object.keys(fp), ...Object.keys(boundary)])].sort();
  expect(Object.keys(fpContracts).sort()).toEqual(exported);
  for (const name of exported) expect(fpContract(name)).not.toBe(false);
  expect(fpContract('toString')).toBe(false);
  expect(fpContract('futureHelper')).toBe(false);
  expect(passiveFp('branded')).toBe(true);
  expect(passiveFp('match')).toBe(false);
  expect(passiveFp('formatDiagnostic')).toBe(false);
});
it('makes deliberately opaque fp behavior visible', () => {
  const files = [
    {
      path: 'src/example.ts',
      content:
        'import {formatDiagnostic} from "@ts-calm/fp"; export const run=(input:unknown)=>formatDiagnostic(input);',
    },
  ];
  const imports = analyzeSources({ files }).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: file.source.path,
      imported,
      target: { kind: 'external' as const },
    })),
  );
  expect(runChecks({ files, imports })).toContainEqual(
    expect.objectContaining({
      rule: 'purity/incomplete',
      severity: 'warning',
      message: expect.stringContaining('formatDiagnostic'),
    }),
  );
});
