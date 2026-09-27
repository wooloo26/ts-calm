import { isAbsolute, relative } from 'node:path';

export const inside = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
};
