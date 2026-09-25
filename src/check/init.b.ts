/**
 * @boundary Create missing configuration, preserving existing project choices and dependencies.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Invalid or concurrently changed metadata must not be overwritten.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainObject } from '#fp/guards';
import {
  formatConfigNames,
  lintConfigNames,
  findConfiguration,
  formatProject,
} from '#check/tools.b';

export type InitResult = Readonly<{
  created: readonly string[];
  updated: readonly string[];
  warnings: readonly string[];
}>;
const pretty = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => item, 2) + '\n';

/** @impure Create missing project configuration and format the created files. */
export const initializeProject = (root: string): InitResult => {
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
        extends: 'ts-calm/tsconfig.node.json',
        include: ['**/*.ts', '**/*.tsx'],
        exclude: ['node_modules', 'dist', 'build', '.local', 'coverage'],
      }),
    );
  if (!findConfiguration(root, lintConfigNames))
    contents.set(
      'oxlint.config.ts',
      "import preset from 'ts-calm/oxlint';\n\nexport default preset;\n",
    );
  if (!findConfiguration(root, formatConfigNames))
    contents.set(
      'oxfmt.config.ts',
      "import preset from 'ts-calm/oxfmt';\n\nexport default preset;\n",
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
  const files = [...created, ...updated];
  if (files.length > 0) formatProject(root, false, files);
  return { created, updated, warnings };
};
