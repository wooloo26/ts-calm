import { parseSource } from '#src/core/parser.b';
import { analyzeBoundary } from '#src/rules/boundary';
import { checkFunctionLength } from '#src/rules/function-length/index';
import { checkImportResolutions } from '#src/rules/imports';
import { checkNoFileCycles } from '#src/rules/no-file-cycles';
import { checkNoModuleCycles } from '#src/rules/no-module-cycles';
import { checkPurity } from '#src/rules/purity/index';
import { checkStrictFp } from '#src/rules/strict-fp';
import { enabled, selected } from '#src/core/configuration';
import { diagnostic, byPosition } from '#src/core/diagnostics';
import type {
  AnalyzedFile,
  Diagnostic,
  CheckConfig,
  CheckInput,
  ResolvedImport,
} from '#src/core/types';

export const analyzeSources = (
  input: CheckInput,
  config: CheckConfig = {},
): readonly AnalyzedFile[] =>
  input.files
    .filter((file) => selected(file.path, config))
    .map((source) => ({
      source,
      parsed: parseSource(source, config.effectImports),
    }));

const checkFile = (file: AnalyzedFile, config: CheckConfig): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const issue of file.parsed.issues)
    diagnostics.push(diagnostic(file.source, 'source/parse', issue.name, issue.offset));
  if (enabled('function-length', file.source.path, config))
    diagnostics.push(...checkFunctionLength(file, config));
  const boundary = analyzeBoundary(file);
  if (enabled('boundary', file.source.path, config)) diagnostics.push(...boundary.diagnostics);
  diagnostics.push(...checkStrictFp(file, config, boundary.allowances));
  return diagnostics;
};

export const runAnalyzedChecks = (
  analyzed: readonly AnalyzedFile[],
  config: CheckConfig = {},
  imports: readonly ResolvedImport[] = [],
): readonly Diagnostic[] => {
  const sources = analyzed.map((file) => file.source);
  const diagnostics: Diagnostic[] = [
    ...analyzed.flatMap((file) => checkFile(file, config)),
    ...checkPurity(analyzed, imports, config),
    ...checkImportResolutions(analyzed, imports),
  ];
  if (config.rules?.['no-file-cycles'] !== false)
    diagnostics.push(...checkNoFileCycles(sources, imports));
  if (config.rules?.['no-module-cycles'] !== false)
    diagnostics.push(...checkNoModuleCycles(sources, imports));
  return diagnostics.toSorted(byPosition);
};

export const runChecks = (input: CheckInput, config: CheckConfig = {}): readonly Diagnostic[] =>
  runAnalyzedChecks(analyzeSources(input, config), config, input.imports ?? []);
