import { diagnostic } from '#src/core/diagnostics';
import type { Diagnostic, ResolvedImport, SourceFile } from '#src/core/types';

export const checkNoFileCycles = (
  files: readonly SourceFile[],
  imports: readonly ResolvedImport[],
): readonly Diagnostic[] => {
  const sources = new Map(files.map((source) => [source.path, source]));
  const graph = new Map<string, { path: string; offset: number }[]>();
  for (const entry of imports) {
    if (entry.target.kind !== 'project') continue;
    const list = graph.get(entry.file) ?? [];
    list.push({ path: entry.target.path, offset: entry.imported.offset });
    graph.set(entry.file, list);
  }
  const active = new Map<string, number>(),
    complete = new Set<string>();
  const trail: string[] = [],
    diagnostics: Diagnostic[] = [];
  /** @impure Update the captured DFS stack and cycle diagnostics. */
  const visit = (file: string): void => {
    if (complete.has(file)) return;
    active.set(file, trail.length);
    trail.push(file);
    for (const edge of graph.get(file) ?? []) {
      const start = active.get(edge.path);
      if (typeof start === 'number') {
        const source = sources.get(file);
        if (source)
          diagnostics.push(
            diagnostic(source, 'no-file-cycles', {
              message: `File cycle: ${[...trail.slice(start), edge.path].join(' -> ')}`,
              offset: edge.offset,
            }),
          );
      } else visit(edge.path);
    }
    trail.pop();
    active.delete(file);
    complete.add(file);
  };
  for (const file of sources.keys()) visit(file);
  return diagnostics;
};
