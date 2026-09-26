/**
 * @boundary Create missing configuration, preserving existing project choices and dependencies.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Invalid or concurrently changed metadata must not be overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainObject } from '@ts-calm/fp';

/**
 * The configuration files created or updated by one `init` invocation.
 *
 * `warnings` carries choices that were preserved but may need attention, such as an existing
 * `type=commonjs` manifest.
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
 * @impure Reads and writes project configuration files.
 * Existing files and existing manifest choices are preserved; only a missing `tsconfig.json`
 * and a missing ESM `type` are added, written exactly as JSON so no formatter is involved.
 * Compiler, formatter and linter presets are re-exported from `@ts-calm/check` by the generated
 * workspace instead of copied into a project.
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
  const contents = new Map<string, string>();
  if (!existsSync(join(root, 'tsconfig.json')))
    contents.set(
      'tsconfig.json',
      pretty({
        extends: '@ts-calm/check/tsconfig.node.json',
        include: ['**/*.ts', '**/*.tsx'],
        exclude: ['node_modules', 'dist', 'build', '.local', 'coverage'],
      }),
    );
  if (!Object.hasOwn(manifest, 'type')) {
    const content = pretty({ ...manifest, type: 'module' });
    if (previous) {
      if (readFileSync(packagePath, 'utf8') !== previous)
        throw new Error('package.json changed during init; retry.');
      writeFileSync(packagePath, content);
      updated.push('package.json');
    } else contents.set('package.json', content);
  } else if (manifest['type'] !== 'module')
    warnings.push(
      `Kept package.json type=${String(manifest['type'])}; adjust your module configuration before using Node ESM exports.`,
    );
  for (const [path, content] of contents) {
    writeFileSync(join(root, path), content, { flag: 'wx' });
    created.push(path);
  }
  return { created, updated, warnings };
};
