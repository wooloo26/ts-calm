import { isAbsolute, relative } from 'node:path';
import type { ImportResolution } from '#src/types';

const normal = (path: string): string => path.replaceAll('\\', '/');

/** Whether the resolved path belongs to another package of the same workspace. */
const inWorkspacePackage = (resolved: string, workspacePackages: readonly string[]): boolean => {
  const path = normal(resolved);
  return workspacePackages.some((directory) => {
    const normalized = normal(directory).replace(/\/$/, '');
    return path === normalized || path.startsWith(`${normalized}/`);
  });
};

/**
 * Classify one resolved import for the cycle and boundary rules.
 *
 * A resolution that entered a package `exports` map is a dependency, even when the package
 * directory sits inside the inspected root (a monorepo workspace). A path inside a sibling
 * workspace package is a dependency too, so one workspace package does not have to reach
 * into its neighbor's sources. Everything else inside `root` that the caller actually
 * analyzed is a project edge.
 *
 * @param root - Absolute inspected project root.
 * @param owned - Root-relative paths that the caller actually analyzed.
 * @param specifier - The original import specifier, used in diagnostics.
 * @param resolved - Absolute resolved filesystem path.
 * @param packageTarget - Whether the resolver entered the target package's exports map.
 * @param workspacePackages - Absolute directories of sibling workspace packages.
 * @returns The resolution classification.
 */
export const classifyTarget = (
  root: string,
  owned: ReadonlySet<string>,
  specifier: string,
  resolved: string,
  packageTarget = false,
  workspacePackages: readonly string[] = [],
): ImportResolution => {
  const path = relative(root, resolved).replaceAll('\\', '/');
  const inside = path !== '..' && !path.startsWith('../') && !isAbsolute(path);
  if (!inside && packageTarget && !specifier.startsWith('.') && !specifier.startsWith('#'))
    return { kind: 'external' };
  if (inside && owned.has(path)) return { kind: 'project', path };
  if (inWorkspacePackage(resolved, workspacePackages)) return { kind: 'external' };
  const dependency = normal(resolved).includes('/node_modules/');
  if (!dependency && /\.[cm]?[jt]sx?$/.test(path) && !/\.d\.[cm]?ts$/.test(path))
    return {
      kind: 'error',
      message: inside
        ? `Project import ${specifier} resolves to excluded or unsupported source ${path}; include supported source to check the complete graph.`
        : `Project import ${specifier} escapes the inspected root.`,
    };
  if (!inside && (specifier.startsWith('.') || specifier.startsWith('#')))
    return { kind: 'error', message: `Project import ${specifier} escapes the inspected root.` };
  return { kind: 'external' };
};
