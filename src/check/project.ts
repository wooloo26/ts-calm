import { checkSourceProject } from './sources.b.ts';
import { formatProject, lintProject, typecheckProject } from './tools.b.ts';
import type { CheckConfig, Diagnostic } from './types.ts';

export const checkProject = (root: string, config?: CheckConfig): readonly Diagnostic[] => [
  ...formatProject(root),
  ...lintProject(root),
  ...typecheckProject(root),
  ...checkSourceProject(root, config),
];

export const checkLint = (root: string, config?: CheckConfig): readonly Diagnostic[] => [
  ...lintProject(root),
  ...checkSourceProject(root, config),
];
