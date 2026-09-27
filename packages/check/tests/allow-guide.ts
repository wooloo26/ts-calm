import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeSources, runChecks } from '@ts-calm/check';
import { getOrElse, getError, isErr, isSome } from '@ts-calm/fp';
import {
  protocolEmpty,
  vendorCallback,
  preserveCleanup,
  completeSafely,
  externalLabel,
  decodeName,
} from '#tests/fixtures/allow-examples.b';

it('keeps all allowance guide examples typechecked and checked against the actual rules', () => {
  const content = readFileSync(new URL('fixtures/allow-examples.b.ts', import.meta.url), 'utf8');
  const files = [{ path: 'examples/allow.b.ts', content }];
  const imports = analyzeSources({ files }).flatMap((file) =>
    file.parsed.imports.map((imported) => ({
      file: file.source.path,
      imported,
      target: { kind: 'external' as const },
    })),
  );
  expect(runChecks({ files, imports })).toEqual([]);
  const guide = readFileSync(new URL('../../../docs/allow.md', import.meta.url), 'utf8');
  for (const match of content
    .replaceAll('\r\n', '\n')
    .matchAll(/\/\/ example: \S+\n([\s\S]*?)\/\/ endexample/g))
    expect(guide).toContain(match[1]?.trim());
});
it('preserves protocol payloads and fixed callback arguments', () => {
  expect(protocolEmpty()).toBeNull();
  const next = vi.fn();
  expect(vendorCallback('fault', 'request', 'response', next)).toEqual({
    error: 'fault',
    request: 'request',
    response: 'response',
  });
  expect(next).toHaveBeenCalledOnce();
});
it('distinguishes finally precedence from explicit cleanup results', () => {
  const primary = new Error('primary'),
    cleanup = new Error('cleanup');
  const fail = () => {
      throw primary;
    },
    clean = () => {
      throw cleanup;
    };
  expect(() => preserveCleanup(fail, clean)).toThrow(cleanup);
  expect(
    preserveCleanup(
      () => 42,
      () => {},
    ),
  ).toBe(42);
  expect(() => preserveCleanup(fail, () => {})).toThrow(primary);
  const result = completeSafely(fail, clean);
  expect(isErr(result)).toBe(true);
  if (!isErr(result)) return;
  const issue = getError(result);
  expect(issue.code).toBe('cleanup-failed');
  if (issue.code === 'cleanup-failed') {
    expect(isSome(issue.operationError)).toBe(true);
    expect(issue.cleanupErrors[0]?.cause).toBe(cleanup);
  }
  expect(
    getOrElse(
      completeSafely(
        () => 'ok',
        () => {},
      ),
      () => 'failed',
    ),
  ).toBe('ok');
});
it('handles absence and validation without suppressions', () => {
  for (const value of [0, false, '']) expect(externalLabel(value)).toBe(value);
  expect(externalLabel(null)).toBe('anonymous');
  expect(externalLabel(undefined)).toBe('anonymous');
  expect(getOrElse(decodeName(' Ada '), () => 'failed')).toBe('Ada');
  expect(isErr(decodeName(42))).toBe(true);
});
