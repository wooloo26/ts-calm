import { diagnostic } from '#src/core/diagnostics';
import type { AnalyzedFile, Diagnostic, ImportFact, ResolvedImport } from '#src/core/types';

const importKey = (file: string, imported: ImportFact): string =>
  `${file}\0${imported.offset}\0${imported.specifier}\0${imported.typeOnly}`;

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

export const checkImportResolutions = (
  analyzed: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
): readonly Diagnostic[] => [
  ...missingResolutions(analyzed, imports),
  ...brokenResolutions(analyzed, imports),
];
