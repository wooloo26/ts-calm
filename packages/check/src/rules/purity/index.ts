import { buildPurityModel } from '#src/rules/purity/model';
import { evaluatePurity } from '#src/rules/purity/eval';
import { diagnostic } from '#src/core/diagnostics';
import { enabled } from '#src/core/configuration';
import type { AnalyzedFile, CheckConfig, Diagnostic, ResolvedImport } from '#src/core/types';
import type { Project, Evaluation } from '#src/rules/purity/values';
import type { FunctionModel, PurityModel } from '#src/rules/purity/model';

const misplaced = (models: readonly PurityModel[], config: CheckConfig): readonly Diagnostic[] =>
  models.flatMap((model) => {
    if (!enabled('purity', model.file.source.path, config)) return [];
    const attached = new Set([...model.functions.values()].flatMap((fn) => fn.annotationOffsets));
    return model.file.parsed.comments
      .filter((comment) => /@impure\b/.test(comment.text) && !attached.has(comment.start))
      .map((comment) =>
        diagnostic(model.file.source, 'purity/placement', {
          message: 'Place @impure in the JSDoc immediately before its function declaration.',
          offset: comment.start,
        }),
      );
  });

export const projectOf = (
  files: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
  config: CheckConfig,
): Project => {
  const models = new Map(files.map((file) => [file.source.path, buildPurityModel(file)]));
  const owned = [...models.values()];
  return {
    models,
    owners: new Map(
      owned.flatMap((model) => [...model.bindings.keys()].map((id) => [id, model] as const)),
    ),
    functions: new Map(owned.flatMap((model) => [...model.functions])),
    bindings: new Map(owned.flatMap((model) => [...model.bindings])),
    targets: new Map(
      imports.flatMap((entry) =>
        entry.target.kind === 'project'
          ? [[`${entry.file}\0${entry.imported.specifier}`, entry.target.path] as const]
          : [],
      ),
    ),
    custom: config.effectImports ?? [],
    declared: new Set<string>(),
  };
};

const settle = (
  project: Project,
  candidates: readonly FunctionModel[],
): ReadonlyMap<string, Evaluation> => {
  const changed = new Set<string>(),
    results = new Map<string, Evaluation>();
  const pending = new Set(candidates);
  for (const fn of pending) {
    pending.delete(fn);
    const evaluation = evaluatePurity(project, fn, { changed });
    results.set(fn.id, evaluation);
    for (const binding of evaluation.writes) {
      if (changed.has(binding)) continue;
      changed.add(binding);
      for (const dependent of candidates)
        if (results.get(dependent.id)?.reads.has(binding)) pending.add(dependent);
    }
  }
  const declared = new Set(
    candidates
      .filter(
        (fn) =>
          fn.annotated &&
          fn.reason &&
          !results.get(fn.id)?.incomplete &&
          results.get(fn.id)?.effects.size === 0,
      )
      .map((fn) => fn.id),
  );
  if (declared.size === 0) return results;
  const scope = { ...project, declared };
  return new Map(candidates.map((fn) => [fn.id, evaluatePurity(scope, fn, { changed })]));
};

export const checkPurity = (
  files: readonly AnalyzedFile[],
  imports: readonly ResolvedImport[],
  config: CheckConfig,
): readonly Diagnostic[] => {
  if (!files.some((file) => enabled('purity', file.source.path, config))) return [];
  const project = projectOf(files, imports, config);
  const candidates = [...project.functions.values()].filter((fn) =>
    enabled('purity', fn.file, config),
  );
  const results = settle(project, candidates);
  const diagnostics: Diagnostic[] = [];
  const incomplete = new Map<string, string[]>();
  for (const fn of candidates) {
    const model = project.models.get(fn.file),
      result = results.get(fn.id);
    if (!model || !result) continue;
    if (result.incomplete) {
      const names = incomplete.get(fn.file) ?? [];
      names.push(fn.name || '<callback>');
      incomplete.set(fn.file, names);
    }
    if (fn.annotated && !fn.reason)
      diagnostics.push(
        diagnostic(model.file.source, 'purity/reason', {
          message: '@impure requires a concrete reason.',
          offset: fn.anchor,
        }),
      );
    if (fn.annotationOffsets.length > 1)
      diagnostics.push(
        diagnostic(model.file.source, 'purity/duplicate', {
          message: 'Use one @impure declaration per function.',
          offset: fn.anchor,
        }),
      );
    const owner = project.functions.get(fn.parent);
    const covered = !fn.name && fn.inline && owner && results.get(owner.id)?.executed.has(fn.id);
    if (result.effects.size === 0 || fn.annotated || covered) continue;
    const evidence = [...result.effects.values()];
    diagnostics.push({
      ...diagnostic(model.file.source, 'purity/impure', {
        message: `Function ${fn.name || '<callback>'} has known effects; add @impure with a reason.`,
        offset: fn.start,
      }),
      help: evidence
        .slice(0, 4)
        .map((item) => `${item.message}: ${item.chain.join(' -> ')}`)
        .join('\n'),
      docs: 'https://github.com/wooloo26/ts-calm/blob/main/docs/rules.md#purity',
    });
  }
  for (const [path, names] of incomplete) {
    const file = project.models.get(path)?.file;
    if (file)
      diagnostics.push(
        diagnostic(file.source, 'purity/incomplete', {
          message: `Purity analysis reached its context budget in ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' and other functions' : ''}; unvisited calls remain unproven.`,
          offset: 0,
          severity: 'warning',
        }),
      );
  }
  return [...diagnostics, ...misplaced([...project.models.values()], config)];
};
