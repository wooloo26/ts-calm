import { checkSourceProject } from '#src/sources.b';
import type { CheckConfig, Diagnostic } from '#src/types';

/**
 * Apply the source rules to one project.
 *
 * Formatting and linting are project scripts (`oxfmt`, `oxlint`), and type checking is the
 * `typecheck` command, so `check` reports only the rules this tool owns.
 *
 * @impure Reads project files from disk.
 * @param root - Absolute project root.
 * @param config - Optional explicit configuration; otherwise the project configuration is loaded.
 * @returns Every source-rule diagnostic.
 */
export const checkProject = (root: string, config?: CheckConfig): Promise<readonly Diagnostic[]> =>
  checkSourceProject(root, config);
