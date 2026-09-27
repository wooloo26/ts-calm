/**
 * @boundary Read and apply a manifest plan, preserving existing project choices and reporting write failures.
 * @effects node:fs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, get, isErr, ok } from '@ts-calm/fp';
import type { AsyncResult } from '@ts-calm/fp';
import { capture, captureResult } from '@ts-calm/fp/boundary';
import { planInitialization } from '#src/manifest';
import type { InitResult } from '#src/manifest';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';

/** @impure Read and write only the project's package manifest. */
export const initializeProject = async (root: string): AsyncResult<InitResult, CheckFailure> => {
  const path = join(root, 'package.json');
  const read = capture(() => (existsSync(path) ? readFileSync(path, 'utf8') : ''), {
    name: 'read-package-manifest',
  });
  if (isErr(read)) return read;
  const previous = get(read),
    plan = planInitialization(previous);
  if (isErr(plan)) return plan;
  const { content, result } = get(plan);
  if (!content) return ok(result);
  return captureResult(
    () => {
      if (previous && readFileSync(path, 'utf8') !== previous)
        return err(
          issue(
            'invalid-manifest',
            'write-package-manifest',
            'package.json changed during init; retry.',
          ),
        );
      if (previous) writeFileSync(path, content);
      else writeFileSync(path, content, { flag: 'wx' });
      return ok(result);
    },
    { name: 'write-package-manifest' },
  );
};
