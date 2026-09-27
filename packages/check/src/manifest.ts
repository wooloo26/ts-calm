import { err, get, isErr, isPlainObject, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';
import { capture } from '@ts-calm/fp/boundary';
import { issue } from '#src/core/issues';
import type { CheckFailure } from '#src/core/issues';

export type InitResult = Readonly<{
  created: readonly string[];
  updated: readonly string[];
  warnings: readonly string[];
}>;
export type InitPlan = Readonly<{ content: string; result: InitResult }>;
export const decodeManifest = (
  source: string,
): Result<Readonly<Record<string, unknown>>, CheckFailure> => {
  const parsed = capture((): unknown => JSON.parse(source), { name: 'decode-package-manifest' });
  if (isErr(parsed)) return parsed;
  const value = get(parsed);
  return isPlainObject(value)
    ? ok(value)
    : err(
        issue(
          'invalid-manifest',
          'decode-package-manifest',
          'package.json must contain an object.',
        ),
      );
};
export const planInitialization = (previous: string): Result<InitPlan, CheckFailure> => {
  const decoded = previous ? decodeManifest(previous) : ok({});
  if (isErr(decoded)) return decoded;
  const manifest: Readonly<Record<string, unknown>> = get(decoded);
  if (Object.hasOwn(manifest, 'type'))
    return ok({
      content: '',
      result: {
        created: [],
        updated: [],
        warnings:
          manifest['type'] === 'module'
            ? []
            : [
                `Kept package.json type=${String(manifest['type'])}; adjust your module configuration before using Node ESM exports.`,
              ],
      },
    });
  const encoded = capture(
    () => JSON.stringify({ ...manifest, type: 'module' }, (_key, item: unknown) => item, 2) + '\n',
    { name: 'encode-package-manifest' },
  );
  return isErr(encoded)
    ? encoded
    : ok({
        content: get(encoded),
        result: {
          created: previous ? [] : ['package.json'],
          updated: previous ? ['package.json'] : [],
          warnings: [],
        },
      });
};
