import { checkSourceProject } from '#src/sources.b';
import type { CheckConfig, Diagnostic } from '#src/core/types';

/**
 * Apply the source rules to one project.
 *
 * Only the rules this tool owns are reported. Formatting, linting and the compiler configuration
 * belong to the project's own toolchain, so no other tool is invoked here.
 *
 * @impure Reads project files from disk.
 * @param root - Absolute project root.
 * @param config - Optional explicit configuration; otherwise the project configuration is loaded.
 * @returns Every source-rule diagnostic.
 */
export const checkProject = (root: string, config?: CheckConfig): Promise<readonly Diagnostic[]> =>
  checkSourceProject(root, config);
