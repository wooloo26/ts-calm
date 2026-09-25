import { diagnostic } from '#check/diagnostics';
import type { Diagnostic, ResolvedImport, SourceFile } from '#check/types';

type Edge = Readonly<{ from: string; to: string; target: string; offset: number }>;
const directory = (path: string): string =>
  path.replaceAll('\\', '/').split('/').slice(0, -1).join('/') || '.';

/** Collapse the resolved file graph, retaining a source witness for every inter-directory edge. */
export const checkModuleCycles = (
  files: readonly SourceFile[],
  imports: readonly ResolvedImport[],
): readonly Diagnostic[] => {
  const sources = new Map(files.map((source) => [source.path, source]));
  const graph = new Map<string, Edge[]>();
  for (const entry of imports) {
    if (
      entry.target.kind !== 'project' ||
      !sources.has(entry.file) ||
      !sources.has(entry.target.path)
    )
      continue;
    const from = directory(entry.file),
      target = directory(entry.target.path);
    if (from === target) continue;
    const edges = graph.get(from) ?? [];
    if (!edges.some((edge) => edge.target === target))
      edges.push({
        from: entry.file,
        to: entry.target.path,
        target,
        offset: entry.imported.offset,
      });
    graph.set(from, edges);
  }
  const active = new Map<string, number>(),
    complete = new Set<string>(),
    reported = new Set<string>();
  const modules: string[] = [],
    trail: Edge[] = [],
    diagnostics: Diagnostic[] = [];
  /** @impure Update the captured directory traversal and diagnostics. */
  const visit = (module: string): void => {
    if (complete.has(module)) return;
    active.set(module, modules.length);
    modules.push(module);
    for (const edge of graph.get(module) ?? []) {
      const start = active.get(edge.target);
      if (typeof start === 'number') {
        const cycle = modules.slice(start),
          key = [...cycle].sort().join('\0');
        const source = sources.get(edge.from);
        if (source && !reported.has(key)) {
          reported.add(key);
          const witnesses = [...trail.slice(start), edge].map((step) => {
            const origin = sources.get(step.from);
            const line = origin ? diagnostic(origin, '', '', step.offset).line : 1;
            return `${step.from}:${line} -> ${step.to}`;
          });
          diagnostics.push({
            ...diagnostic(
              source,
              'no-module-cycles',
              `Directory cycle: ${[...cycle, edge.target].join(' -> ')}`,
              edge.offset,
            ),
            help: witnesses.join('\n'),
          });
        }
      } else {
        trail.push(edge);
        visit(edge.target);
        trail.pop();
      }
    }
    modules.pop();
    active.delete(module);
    complete.add(module);
  };
  for (const module of graph.keys()) visit(module);
  return diagnostics;
};
