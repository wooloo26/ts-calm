/**
 * @boundary Create the missing Node ESM manifest choice, preserving existing project decisions.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Invalid or concurrently changed metadata must not be overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainObject } from '@ts-calm/fp';

/**
 * The files created or updated by one `init` invocation.
 *
 * Only `package.json` is ever created or updated; compiler, formatter and linter files belong to
 * the project's own toolchain. `warnings` carries choices that were preserved but may need
 * attention, such as an existing `type=commonjs` manifest.
 */
export type InitResult = Readonly<{
  /** Project-relative paths created by this call. */
  created: readonly string[];
  /** Project-relative paths that existed and were updated. */
  updated: readonly string[];
  /** Non-fatal notes about preserved decisions. */
  warnings: readonly string[];
}>;
const keep = (_key: string, item: unknown): unknown => item;
const pretty = (value: unknown): string => JSON.stringify(value, keep, 2) + '\n';

/**
 * Create the missing Node ESM project configuration.
 *
 * @impure Reads and writes the project manifest.
 * Existing files and existing manifest choices are preserved; only a missing ESM `type` is added,
 * written exactly as JSON so no formatter is involved. A project provides its own `tsconfig.json`,
 * formatter and linter configuration, so nothing else is created here.
 *
 * @param root - Absolute project root.
 * @returns The created and updated paths plus any warnings.
 * @throws If `package.json` is invalid or changes concurrently.
 */
export const initializeProject = async (root: string): Promise<InitResult> => {
  const created: string[] = [],
    updated: string[] = [],
    warnings: string[] = [];
  const packagePath = join(root, 'package.json');
  const previous = existsSync(packagePath) ? readFileSync(packagePath, 'utf8') : '';
  const manifest: unknown = previous ? JSON.parse(previous) : {};
  if (!isPlainObject(manifest)) throw new Error('package.json must contain an object.');
  if (!Object.hasOwn(manifest, 'type')) {
    const content = pretty({ ...manifest, type: 'module' });
    if (previous) {
      if (readFileSync(packagePath, 'utf8') !== previous)
        throw new Error('package.json changed during init; retry.');
      writeFileSync(packagePath, content);
      updated.push('package.json');
    } else {
      writeFileSync(packagePath, content, { flag: 'wx' });
      created.push('package.json');
    }
  } else if (manifest['type'] !== 'module')
    warnings.push(
      `Kept package.json type=${String(manifest['type'])}; adjust your module configuration before using Node ESM exports.`,
    );
  return { created, updated, warnings };
};
