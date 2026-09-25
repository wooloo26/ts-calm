import { checkSourceProject } from '#check/sources.b';
import { formatProject, lintProject, typecheckProject } from '#check/tools.b';
import type { CheckConfig, Diagnostic } from '#check/types';

/** @impure Read project inputs and execute all pinned static tools. */
export const checkProject = (root: string, config?: CheckConfig): readonly Diagnostic[] => [
  ...formatProject(root),
  ...lintProject(root),
  ...typecheckProject(root),
  ...checkSourceProject(root, config),
];

/** @impure Read project inputs and execute the native linter. */
export const checkLint = (root: string, config?: CheckConfig): readonly Diagnostic[] => [
  ...lintProject(root),
  ...checkSourceProject(root, config),
];
