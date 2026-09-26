/**
 * @boundary Render a complete workspace into an empty directory without installing dependencies or starting tools.
 * @effects node:fs
 * @effects node:module
 * @allow strict-fp/no-throw -- Refuse conflicts and invalid bundled metadata before writing project files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { format } from 'oxfmt';
import { captureAsync } from '@ts-calm/fp/boundary';
import { get, getError, isErr, isPlainObject } from '@ts-calm/fp';
import { workspaceTemplate } from './template.ts';
import type { WorkspaceTemplateOptions } from './template.ts';

/**
 * The files and warnings produced by one workspace initialization.
 *
 * `updated` is always empty: the generator only creates files into an absent or empty
 * directory and never rewrites an existing project file.
 */
export type WorkspaceResult = Readonly<{
  /** Destination-relative paths created by this call, in write order. */
  created: readonly string[];
  /** Always empty; a nonempty destination is refused before writing. */
  updated: readonly string[];
  /** Non-fatal notes about the generated workspace. */
  warnings: readonly string[];
}>;

/** @impure Read the installed package metadata for one dependency. */
const installedVersion = (name: string): string => {
  const load = createRequire(import.meta.url);
  const metadata: unknown = JSON.parse(readFileSync(load.resolve(`${name}/package.json`), 'utf8'));
  if (!isPlainObject(metadata) || typeof metadata['version'] !== 'string')
    throw new Error(`Invalid bundled package metadata for ${name}.`);
  return metadata['version'];
};

/**
 * Read the pinned versions this package was published with.
 *
 * @impure Reads `package.json` files from the installed dependency graph.
 * The compiler, Turbo and Vitest versions come from the installed packages, so a generated
 * workspace always pins exactly what the published template was verified against. Call this
 * only when explicit options are unavailable; it reads `package.json` files from disk.
 *
 * @returns The bundled template options.
 * @throws If a bundled manifest is unreadable or lacks a version.
 */
export const bundledTemplateOptions = (): WorkspaceTemplateOptions =>
  Object.freeze({
    fpVersion: installedVersion('@ts-calm/fp'),
    checkVersion: installedVersion('@ts-calm/check'),
    compiler: installedVersion('typescript'),
    turbo: installedVersion('turbo'),
    vitest: installedVersion('vitest'),
  });

/**
 * Create a complete workspace in an absent or empty directory.
 *
 * @impure Renders and writes project files into the destination directory.
 * Every rendered file is formatted with the bundled Oxfmt preset before writing, so the
 * result is immediately clean. The destination is re-inspected after rendering and before
 * the first write, and every file is created with the exclusive `wx` flag, so a concurrent
 * writer cannot be silently overwritten. Nothing is installed or started.
 *
 * @param directory - Destination directory; it must be absent or empty.
 * @param options - Template versions; defaults to {@link bundledTemplateOptions}.
 * @returns The created paths and any warnings.
 * @throws If the destination is nonempty, changes during rendering, or a template file
 * cannot be formatted.
 * @example
 * ```ts
 * await initializeWorkspace('./my-project');
 * // then: cd my-project && pnpm install && pnpm build
 * ```
 */
export const initializeWorkspace = async (
  directory: string,
  options?: WorkspaceTemplateOptions,
): Promise<WorkspaceResult> => {
  const resolved = options ?? bundledTemplateOptions();
  const root = resolve(directory);
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination must be absent or empty.');
  const files = workspaceTemplate(resolved);
  if (files.length === 0) throw new Error('The workspace template is empty.');
  const rendered: Readonly<{ path: string; content: string }>[] = [];
  for (const file of files) {
    if (file.path === '.gitignore') {
      rendered.push(file);
      continue;
    }
    const formatted = await captureAsync(
      () => format(file.path, file.content, { singleQuote: true, printWidth: 100 }),
      { name: 'oxfmt' },
    );
    if (isErr(formatted)) throw new Error(getError(formatted).message);
    const renderedFile = get(formatted);
    if (renderedFile.errors.length > 0) throw new Error(`Cannot format template ${file.path}.`);
    rendered.push({ path: file.path, content: renderedFile.code });
  }
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination changed; expected an empty directory.');
  mkdirSync(root, { recursive: true });
  for (const file of rendered) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content, { flag: 'wx' });
  }
  return { created: rendered.map((file) => file.path), updated: [], warnings: [] };
};
