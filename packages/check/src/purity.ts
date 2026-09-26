import { buildPurityModel } from '#src/purity-model';
import { evaluatePurity } from '#src/purity-eval';
import { diagnostic } from '#src/diagnostics';
import { enabled } from '#src/configuration';
import type { AnalyzedFile, CheckConfig, Diagnostic, ResolvedImport } from '#src/types';
import type { Project, Evaluation } from '#src/purity-values';
import type { FunctionModel, PurityModel } from '#src/purity-model';

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

const maximumRounds = 3;
const sameMembers = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && [...left].every((item) => right.has(item));

const projectOf = (
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
  let changed = new Set<string>(),
    declared = new Set<string>(),
    results = new Map<string, Evaluation>();
  for (let round = 0; round < maximumRounds; round += 1) {
    const scope = declared.size > 0 ? { ...project, declared } : project;
    const nextChanged = new Set<string>();
    results = new Map();
    for (const fn of candidates) {
      const evaluation = evaluatePurity(scope, fn, changed);
      results.set(fn.id, evaluation);
      for (const binding of evaluation.writes) nextChanged.add(binding);
    }
    const nextDeclared = new Set(
      candidates
        .filter((fn) => fn.annotated && fn.reason && results.get(fn.id)?.effects.size === 0)
        .map((fn) => fn.id),
    );
    const stable = sameMembers(nextChanged, changed) && sameMembers(nextDeclared, declared);
    changed = nextChanged;
    declared = nextDeclared;
    if (stable) break;
  }
  return results;
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
  for (const fn of candidates) {
    const model = project.models.get(fn.file),
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
    const owner = project.functions.get(fn.parent);
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
  return [...diagnostics, ...misplaced([...project.models.values()], config)];
};
