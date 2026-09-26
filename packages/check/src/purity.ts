import { buildPurityModel } from '#src/purity-model';
import { evaluatePurity } from '#src/purity-eval';
import { diagnostic } from '#src/diagnostics';
import { enabled } from '#src/configuration';
import type { AnalyzedFile, CheckConfig, Diagnostic, ResolvedImport } from '#src/types';
import type { Project, Evaluation } from '#src/purity-values';
import type { PurityModel } from '#src/purity-model';

const misplaced = (models: readonly PurityModel[], config: CheckConfig): readonly Diagnostic[] =>
  models.flatMap((model) => {
    if (!enabled('purity', model.file.source.path, config)) return [];
    const attached = new Set([...model.functions.values()].flatMap((fn) => fn.annotationOffsets));
    return model.file.parsed.comments
      .filter((comment) => /@impure\b/.test(comment.text) && !attached.has(comment.start))
      .map((comment) =>
        diagnostic(
          model.file.source,
          'purity/placement',
          'Place @impure in the JSDoc immediately before its function declaration.',
          comment.start,
        ),
      );
  });

export const checkPurity = (
  files: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
  config: CheckConfig,
): readonly Diagnostic[] => {
  if (!files.some((file) => enabled('purity', file.source.path, config))) return [];
  const models = new Map(files.map((file) => [file.source.path, buildPurityModel(file)]));
  const functions = new Map([...models.values()].flatMap((model) => [...model.functions]));
  const bindings = new Map([...models.values()].flatMap((model) => [...model.bindings]));
  const targets = new Map(
    imports.flatMap((entry) =>
      entry.target.kind === 'project'
        ? [[`${entry.file}\0${entry.imported.specifier}`, entry.target.path] as const]
        : [],
    ),
  );
  const project: Project = {
    models,
    functions,
    bindings,
    targets,
    custom: config.effectImports ?? [],
    declared: new Set<string>(),
  };
  const candidates = [...functions.values()].filter((fn) => enabled('purity', fn.file, config));
  const changed = new Set<string>(),
    results = new Map<string, Evaluation>();
  for (const fn of candidates)
    for (const binding of evaluatePurity(project, fn, changed).writes) changed.add(binding);
  const declared = new Set(
    candidates
      .filter(
        (fn) =>
          fn.annotated && fn.reason && evaluatePurity(project, fn, changed).effects.size === 0,
      )
      .map((fn) => fn.id),
  );
  for (const fn of candidates)
    results.set(fn.id, evaluatePurity({ ...project, declared }, fn, changed));
  const diagnostics: Diagnostic[] = [];
  for (const fn of candidates) {
    const model = models.get(fn.file),
      result = results.get(fn.id);
    if (!model || !result) continue;
    if (fn.annotated && !fn.reason)
      diagnostics.push(
        diagnostic(
          model.file.source,
          'purity/reason',
          '@impure requires a concrete reason.',
          fn.anchor,
        ),
      );
    if (fn.annotationOffsets.length > 1)
      diagnostics.push(
        diagnostic(
          model.file.source,
          'purity/duplicate',
          'Use one @impure declaration per function.',
          fn.anchor,
        ),
      );
    const owner = functions.get(fn.parent);
    const covered = !fn.name && fn.inline && owner && results.get(owner.id)?.executed.has(fn.id);
    if (result.effects.size === 0 || fn.annotated || covered) continue;
    const evidence = [...result.effects.values()];
    diagnostics.push({
      ...diagnostic(
        model.file.source,
        'purity/impure',
        `Function ${fn.name || '<callback>'} has known effects; add @impure with a reason.`,
        fn.start,
      ),
      help: evidence
        .slice(0, 4)
        .map((item) => `${item.message}: ${item.chain.join(' -> ')}`)
        .join('\n'),
      docs: 'https://github.com/wooloo26/ts-calm/blob/main/docs/rules.md#purity',
    });
  }
  return [...diagnostics, ...misplaced([...models.values()], config)];
};
