import { parseSource } from './parser.b.ts';
import { analyzeBoundary } from './boundary.ts';
import { checkFunctionLength } from './function-length.ts';
import { checkCycles } from './cycles.ts';
import { enabled, selected } from './configuration.ts';
import { diagnostic } from './diagnostics.ts';
import type { AnalyzedFile, Diagnostic, GateConfiguration, GateInput } from './types.ts';

export const analyzeSources = (
  input: GateInput,
  config: GateConfiguration = {},
): readonly AnalyzedFile[] =>
  input.files
    .filter((file) => selected(file.path, config))
    .map((source) => ({
      source,
      parsed: parseSource(source, config.effectImports),
    }));

const checkFile = (file: AnalyzedFile, config: GateConfiguration): readonly Diagnostic[] => {
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
      diagnostics.push(
        diagnostic(
          file.source,
          `strict-fp/${fact.name}`,
          `Forbidden ${fact.name}; isolate necessary adaptation in a documented .b.ts file.`,
          fact.offset,
        ),
      );
    }
  }
  return diagnostics;
};

export const runGates = (
  input: GateInput,
  config: GateConfiguration = {},
): readonly Diagnostic[] => {
  const analyzed = analyzeSources(input, config);
  const diagnostics = analyzed.flatMap((file) => checkFile(file, config));
  const checked = new Set(analyzed.map((file) => file.source.path));
  for (const file of analyzed)
    for (const imported of file.parsed.imports)
      if (
        !(input.imports ?? []).some(
          (entry) =>
            entry.file === file.source.path &&
            entry.imported.offset === imported.offset &&
            entry.imported.specifier === imported.specifier &&
            entry.imported.typeOnly === imported.typeOnly,
        )
      )
        diagnostics.push(
          diagnostic(
            file.source,
            'imports/resolve',
            `Missing resolution for ${imported.specifier}; supply a complete import graph or use checkProject.`,
            imported.offset,
          ),
        );
  for (const entry of input.imports ?? []) {
    const source = input.files.find((file) => file.path === entry.file);
    if (
      source &&
      checked.has(source.path) &&
      entry.target.kind === 'project' &&
      !checked.has(entry.target.path)
    )
      diagnostics.push(
        diagnostic(
          source,
          'imports/resolve',
          `Project target ${entry.target.path} is missing from the inspected source set.`,
          entry.imported.offset,
        ),
      );
    if (source && checked.has(source.path) && entry.target.kind === 'error')
      diagnostics.push(
        diagnostic(source, 'imports/resolve', entry.target.message, entry.imported.offset),
      );
  }
  if (config.rules?.['no-file-cycles'] !== false) {
    diagnostics.push(
      ...checkCycles(
        analyzed.map((file) => file.source),
        input.imports ?? [],
      ),
    );
  }
  return diagnostics.toSorted(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.rule.localeCompare(right.rule),
  );
};
