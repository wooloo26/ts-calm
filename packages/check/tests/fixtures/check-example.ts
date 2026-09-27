import { get, isErr, map, match } from '@ts-calm/fp';
import { checkProject, validateConfiguration, failureMessage } from '@ts-calm/check';

/** @impure Read a project only after the configuration has been decoded successfully. */
export const reviewProject = async (root: string, input: unknown) => {
  const config = validateConfiguration(input);
  if (isErr(config)) return config;
  return map(await checkProject(root, get(config)), (diagnostics) => ({
    diagnostics,
    passed: diagnostics.every((issue) => issue.severity !== 'error'),
  }));
};

/** @impure Read the project and present either its report or a normalized operational failure. */
export const reviewSummary = async (root: string, input: unknown) =>
  match(await reviewProject(root, input), {
    ok: (report) =>
      report.passed ? 'Checks passed.' : `${report.diagnostics.length} diagnostics.`,
    err: failureMessage,
  });
