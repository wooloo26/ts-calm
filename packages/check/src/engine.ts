import { parseSource } from '#src/parser.b';
import { analyzeBoundary } from '#src/boundary';
import { checkFunctionLength } from '#src/function-length';
import { checkCycles } from '#src/cycles';
import { checkModuleCycles } from '#src/module-cycles';
import { checkPurity } from '#src/purity';
import { helpForRule, documentationFor } from '#src/rule-help';
import { enabled, selected } from '#src/configuration';
import { diagnostic, byPosition } from '#src/diagnostics';
import type {
  AnalyzedFile,
  Diagnostic,
  CheckConfig,
  CheckInput,
  ImportFact,
  ResolvedImport,
} from '#src/types';

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
  if (enabled('strict-fp', file.source.path, config)) {
    const setting = config.rules?.['strict-fp'];
    const options = typeof setting === 'object' ? setting : {};
    for (const fact of file.parsed.strict) {
      const disabled = Object.entries(options).some(
        ([name, active]) => name === fact.name && active === false,
      );
      if (disabled || boundary.allowances.has('*') || boundary.allowances.has(fact.name)) continue;
      const rule = `strict-fp/${fact.name}`;
      const help = helpForRule(rule);
      diagnostics.push({
        ...diagnostic(file.source, rule, `Forbidden ${fact.name}.`, fact.offset),
        ...(help ? { help: help.summary, docs: documentationFor(rule) } : {}),
      });
    }
  }
  return diagnostics;
};

const importKey = (file: string, imported: ImportFact): string =>
  `${file}\0${imported.offset}\0${imported.specifier}\0${imported.typeOnly}`;

/** Imports the parser saw but the caller never resolved. */
const missingResolutions = (
  analyzed: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
): readonly Diagnostic[] => {
  const resolved = new Set(imports.map((entry) => importKey(entry.file, entry.imported)));
  const diagnostics: Diagnostic[] = [];
  for (const file of analyzed)
    for (const imported of file.parsed.imports)
      if (!resolved.has(importKey(file.source.path, imported)))
        diagnostics.push(
          diagnostic(
            file.source,
            'imports/resolve',
            `Missing resolution for ${imported.specifier}; supply a complete import graph or use checkProject.`,
            imported.offset,
          ),
        );
  return diagnostics;
};

/** Resolutions that point outside the inspected source set or failed outright. */
const brokenResolutions = (
  analyzed: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
): readonly Diagnostic[] => {
  const inspected = new Map(analyzed.map((file) => [file.source.path, file.source]));
  const diagnostics: Diagnostic[] = [];
  for (const entry of imports) {
    const source = inspected.get(entry.file);
    if (!source) continue;
    if (entry.target.kind === 'project' && !inspected.has(entry.target.path))
      diagnostics.push(
        diagnostic(
          source,
          'imports/resolve',
          `Project target ${entry.target.path} is missing from the inspected source set.`,
          entry.imported.offset,
        ),
      );
    if (entry.target.kind === 'error')
      diagnostics.push(
        diagnostic(source, 'imports/resolve', entry.target.message, entry.imported.offset),
      );
  }
  return diagnostics;
};

/**
 * Apply every rule to sources that were already analyzed.
 *
 * `checkSourceProject` analyzes once, resolves the import graph from those facts and lands here,
 * so a full check parses and models each file exactly once.
 *
 * @param analyzed - The selected files paired with their parser facts.
 * @param config - Optional explicit configuration.
 * @param imports - The resolved import graph for those files.
 * @returns Every source-rule diagnostic, sorted by file, position and rule.
 */
export const runAnalyzedChecks = (
  analyzed: readonly AnalyzedFile[],
  config: CheckConfig = {},
  imports: readonly ResolvedImport[] = [],
): readonly Diagnostic[] => {
  const sources = analyzed.map((file) => file.source);
  const diagnostics: Diagnostic[] = [
    ...analyzed.flatMap((file) => checkFile(file, config)),
    ...checkPurity(analyzed, imports, config),
    ...missingResolutions(analyzed, imports),
    ...brokenResolutions(analyzed, imports),
  ];
  if (config.rules?.['no-file-cycles'] !== false)
    diagnostics.push(...checkCycles(sources, imports));
  if (config.rules?.['no-module-cycles'] !== false)
    diagnostics.push(...checkModuleCycles(sources, imports));
  return diagnostics.toSorted(byPosition);
};

export const runChecks = (input: CheckInput, config: CheckConfig = {}): readonly Diagnostic[] =>
  runAnalyzedChecks(analyzeSources(input, config), config, input.imports ?? []);
