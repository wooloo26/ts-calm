import { isAbsolute, relative } from 'node:path';
import type { ImportResolution } from '#check/types';

export const classifyTarget = (
  root: string,
  owned: ReadonlySet<string>,
  specifier: string,
  resolved: string,
  packageTarget = false,
): ImportResolution => {
  const path = relative(root, resolved).replaceAll('\\', '/');
  const inside = path !== '..' && !path.startsWith('../') && !isAbsolute(path);
  if (inside && owned.has(path)) return { kind: 'project', path };
  if (!inside && packageTarget && !specifier.startsWith('.') && !specifier.startsWith('#'))
    return { kind: 'external' };
  const dependency = resolved.replaceAll('\\', '/').includes('/node_modules/');
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
