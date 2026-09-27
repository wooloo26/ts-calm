import { get, isErr, ok } from '@ts-calm/fp';
import type { AsyncResult } from '@ts-calm/fp';
import { readSources } from '#src/sources.b';
import { loadConfiguration } from '#src/config-reader.b';
import { resolveImports } from '#src/resolver.b';
import { analyzeSources, runAnalyzedChecks } from '#src/engine';
import type { CheckConfig, Diagnostic } from '#src/core/types';
import type { CheckFailure } from '#src/core/issues';

/**
 * Check one project. Rule violations are successful diagnostic results; operational failures are Err.
 * @impure Read project configuration, sources and import metadata.
 */
export const checkProject = async (
  root: string,
  configuration?: CheckConfig,
): AsyncResult<readonly Diagnostic[], CheckFailure> => {
  const loaded = configuration ? ok(configuration) : loadConfiguration(root);
  if (isErr(loaded)) return loaded;
  const config = get(loaded),
    sources = readSources(root, config);
  if (isErr(sources)) return sources;
  const { files, paths } = get(sources),
    analyzed = analyzeSources({ files }, config);
  const imports = resolveImports(root, analyzed, paths);
  return isErr(imports) ? imports : ok(runAnalyzedChecks(analyzed, config, get(imports)));
};

export { checkProject as checkSourceProject };
