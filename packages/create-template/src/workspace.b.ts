/**
 * @boundary Render a complete workspace into an empty directory without installing dependencies or starting tools.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Refuse conflicts and invalid bundled metadata before writing project files.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { workspaceTemplate } from './template.ts';
import { toolchainVersions } from './toolchain.ts';
import type { WorkspaceTemplateOptions } from './template.ts';

/**
 * The files and warnings produced by one workspace initialization.
 *
 * Both `updated` and `warnings` are always empty: the generator only creates files into an absent
 * or empty directory and never rewrites an existing project file, so there is nothing to update
 * and nothing to warn about.
 */
export type WorkspaceResult = Readonly<{
  /** Destination-relative paths created by this call, in write order. */
  created: readonly string[];
  /** Always empty; a nonempty destination is refused before writing. */
  updated: readonly string[];
  /** Always empty; the destination is validated before anything is written. */
  warnings: readonly string[];
}>;

/**
 * Read the pinned versions this package was published with.
 *
 * @returns The bundled template options.
 * @example
 * ```ts
 * const files = workspaceTemplate(bundledTemplateOptions());
 * ```
 */
export const bundledTemplateOptions = (): WorkspaceTemplateOptions =>
  Object.freeze({
    fpVersion: toolchainVersions.fp,
    checkVersion: toolchainVersions.check,
    compiler: toolchainVersions.typescript,
    turbo: toolchainVersions.turbo,
    vitest: toolchainVersions.vitest,
  });

/**
 * Create a complete workspace in an absent or empty directory.
 *
 * @impure Renders and writes project files into the destination directory.
 * The generator writes exactly what the template renders, so it needs no formatter, linter or
 * compiler of its own. The destination is re-inspected after rendering and before the first
 * write, and every file is created with the exclusive `wx` flag, so a concurrent writer cannot
 * be silently overwritten. Nothing is installed or started.
 *
 * @param directory - Destination directory; it must be absent or empty.
 * @param options - Template versions; defaults to {@link bundledTemplateOptions}.
 * @returns The created paths and any warnings.
 * @throws If the destination is nonempty or changes during rendering.
 * @example
 * ```ts
 * await initializeWorkspace('./my-project');
 * // then: cd my-project && pnpm install && pnpm fmt
 * ```
 */
export const initializeWorkspace = async (
  directory: string,
  options?: WorkspaceTemplateOptions,
): Promise<WorkspaceResult> => {
  const root = resolve(directory);
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination must be absent or empty.');
  const files = workspaceTemplate(options ?? bundledTemplateOptions());
  if (files.length === 0) throw new Error('The workspace template is empty.');
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination changed; expected an empty directory.');
  mkdirSync(root, { recursive: true });
  for (const file of files) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content, { flag: 'wx' });
  }
  return { created: files.map((file) => file.path), updated: [], warnings: [] };
};
