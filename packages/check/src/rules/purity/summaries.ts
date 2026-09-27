import { valueKey } from '#src/rules/purity/values';
import type { Value, Frame, Project } from '#src/rules/purity/values';
import type { FunctionModel } from '#src/rules/purity/model';

const keys = (values: readonly Value[]): string =>
  JSON.stringify(values.map((value) => valueKey(value)).toSorted());

/** Contexts retain callback identity, captured arguments and which lexical scopes own local state. */
export const summaryContext = (
  project: Project,
  fn: FunctionModel,
  { args, caller }: Readonly<{ args: readonly (readonly Value[])[]; caller?: Frame }>,
): Readonly<{ key: string; borrowed: boolean; recursion: string }> => {
  const captures = new Set(fn.captures);
  const pending = args.flat();
  const visited = new Set<string>();
  let borrowed = pending.some((value) => value.kind === 'fresh');
  for (let value = pending.pop(); value; value = pending.pop()) {
    if (value.kind === 'container') pending.push(...value.payload);
    if (value.kind === 'decoder' || value.kind === 'decoder-call') pending.push(...value.callbacks);
    borrowed ||= value.kind === 'fresh';
    if (value.kind !== 'function' || visited.has(value.id)) continue;
    visited.add(value.id);
    for (const id of project.functions.get(value.id)?.captures ?? []) captures.add(id);
  }
  const environment: string[] = [];
  for (const id of [...captures].sort()) {
    const values = caller?.env.get(id) ?? [];
    const owner = project.bindings.get(id)?.owner ?? '';
    borrowed ||= values.some((value) => value.kind === 'fresh');
    environment.push(JSON.stringify([id, keys(values), caller?.active.has(owner) ?? false]));
  }
  const recursion = JSON.stringify(
    args.map((values) =>
      values
        .filter(
          (value) =>
            value.kind === 'function' ||
            (value.kind === 'reference' && value.shape) ||
            (value.kind === 'external' && !value.name.endsWith('()')),
        )
        .map((value) => (value.kind === 'reference' ? value.id : valueKey(value))),
    ),
  );
  return { key: JSON.stringify([fn.id, args.map(keys), environment]), borrowed, recursion };
};

/** Returned private allocations and closures need a new activation, not a shared cached identity. */
export const reusableReturn = (values: readonly Value[], project: Project): boolean =>
  values.every(
    (value) =>
      (value.kind !== 'container' || reusableReturn(value.payload, project)) &&
      ((value.kind !== 'decoder' && value.kind !== 'decoder-call') ||
        reusableReturn(value.callbacks, project)) &&
      value.kind !== 'fresh' &&
      (value.kind !== 'function' ||
        !project.functions.has(project.functions.get(value.id)?.parent ?? '')),
  );

export const sameValues = (left: readonly Value[], right: readonly Value[]): boolean =>
  keys(left) === keys(right);
