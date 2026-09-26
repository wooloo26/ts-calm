import { isAbsolute, relative } from 'node:path';
import type { ImportResolution } from '#src/core/types';

const normal = (path: string): string => path.replaceAll('\\', '/');

const inWorkspacePackage = (resolved: string, workspacePackages: readonly string[]): boolean => {
  const path = normal(resolved);
  return workspacePackages.some((directory) => {
    const normalized = normal(directory).replace(/\/$/, '');
    return path === normalized || path.startsWith(`${normalized}/`);
  });
};

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
