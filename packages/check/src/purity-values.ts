import { record, text, children } from '#src/parser.b';
import { typeKind } from '#src/purity-model';
import type { Node } from '#src/parser.b';
import type { PurityModel, FunctionModel, Binding } from '#src/purity-model';

export type Value =
  | Readonly<{ kind: 'unknown'; shape?: string }>
  | Readonly<{ kind: 'function'; id: string }>
  | Readonly<{ kind: 'external'; name: string }>
  | Readonly<{ kind: 'reference'; id: string; path: readonly string[]; shape: string }>
  | Readonly<{
      kind: 'fresh';
      id: string;
      shape: string;
      slots: Map<string, readonly Value[]>;
      spread: Value[];
    }>;
export type Frame = Readonly<{
  fn: FunctionModel;
  env: ReadonlyMap<string, readonly Value[]>;
  active: ReadonlySet<string>;
  chain: readonly string[];
}>;
export type Effect = Readonly<{
  message: string;
  offset: number;
  file: string;
  chain: readonly string[];
  binding?: string;
}>;
export type Evaluation = {
  effects: Map<string, Effect>;
  writes: Set<string>;
  executed: Set<string>;
  fresh: Map<string, Value>;
  calls: Map<string, readonly Value[]>;
  activeCalls: Set<string>;
};
export type Project = Readonly<{
  models: ReadonlyMap<string, PurityModel>;
  functions: ReadonlyMap<string, FunctionModel>;
  bindings: ReadonlyMap<string, Binding>;
  targets: ReadonlyMap<string, string>;
  custom: readonly string[];
  declared: ReadonlySet<string>;
}>;
export const unknown: Value = { kind: 'unknown' };
export const valueKey = (value: Value): string =>
  value.kind === 'reference'
    ? `${value.id}.${value.path.join('.')}`
    : value.kind === 'function' || value.kind === 'fresh'
      ? value.id
      : value.kind === 'external'
        ? value.name
        : '?';
export const unique = (values: readonly Value[]): readonly Value[] => [
  ...new Map(values.map((value) => [valueKey(value), value])).values(),
];

const expand = (
  node: Node,
  model: PurityModel,
  project: Project,
  seen = new Set<string>(),
): Readonly<{ node: Node; model: PurityModel }> => {
  if (node['type'] === 'TSTypeAnnotation' || node['type'] === 'TSTypeOperator')
    return expand(record(node['typeAnnotation']), model, project, seen);
  const name = text(record(node['typeName']), 'name');
  const key = `${model.file.source.path}:${name}`;
  if (['Readonly', 'Partial', 'Required'].includes(name)) {
    const parameters = record(node['typeArguments'] ?? node['typeParameters']);
    const first = children(parameters)[0]?.node;
    if (first) return expand(first, model, project, seen);
  }
  if (name && !seen.has(key)) {
    if (model.typeDefs.has(name))
      return expand(model.typeDefs.get(name) ?? {}, model, project, new Set([...seen, key]));
    const imported = [...model.bindings.values()].find(
      (binding) => binding.name === name && binding.specifier,
    );
    const target = imported
      ? project.targets.get(`${model.file.source.path}\0${imported.specifier}`)
      : '';
    const other = target ? project.models.get(target) : false;
    if (other && imported)
      return expand(
        other.typeDefs.get(imported.imported) ?? {},
        other,
        project,
        new Set([...seen, key]),
      );
  }
  return { node, model };
};

export const referenceShape = (
  binding: Binding,
  path: readonly string[],
  model: PurityModel,
  project: Project,
): string => {
  let current = expand(binding.annotation, model, project);
  for (const key of path) {
    const property = children(current.node)
      .map((entry) => entry.node)
      .find((entry) => text(record(entry['key']), 'name') === key);
    current = expand(record(property?.['typeAnnotation']), current.model, project);
  }
  return path.length === 0 ? binding.type : typeKind(current.node);
};

export const property = (value: Value, key: string, project: Project): readonly Value[] => {
  if (value.kind === 'external')
    return [
      { kind: 'external', name: `${value.name}${value.name.endsWith(':') ? '' : '.'}${key}` },
    ];
  if (value.kind === 'reference') {
    const binding = project.bindings.get(value.id);
    const ownerModel = binding
      ? [...project.models.values()].find((candidate) => candidate.bindings.has(binding.id))
      : false;
    const path = [...value.path, key].slice(0, 8);
    return [
      {
        ...value,
        path,
        shape: binding && ownerModel ? referenceShape(binding, path, ownerModel, project) : '',
      },
    ];
  }
  if (value.kind === 'fresh') {
    const own = value.slots.get(key) ?? value.slots.get('*');
    if (own) return own;
    if (value.spread.length)
      return unique(value.spread.flatMap((entry) => property(entry, key, project)));
  }
  return [unknown];
};

export const fnForExport = (
  project: Project,
  path: string,
  name: string,
  seen = new Set<string>(),
): readonly Value[] => {
  const key = `${path}:${name}`;
  if (seen.has(key)) return [unknown];
  const model = project.models.get(path);
  if (!model) return [unknown];
  const target = model.exports.get(name),
    next = new Set([...seen, key]);
  if (target?.binding) {
    if (project.functions.has(target.binding)) return [{ kind: 'function', id: target.binding }];
    const binding = model.bindings.get(target.binding);
    const functions =
      binding?.values.flatMap((node) => {
        const id = model.functionNodes.get(Number(node['start']));
        return id ? [{ kind: 'function' as const, id }] : [];
      }) ?? [];
    if (functions.length) return functions;
    if (binding?.specifier) {
      const destination = project.targets.get(`${path}\0${binding.specifier}`);
      if (destination) return fnForExport(project, destination, binding.imported, next);
    }
  }
  if (target?.specifier) {
    const destination = project.targets.get(`${path}\0${target.specifier}`);
    if (destination) return fnForExport(project, destination, target.name ?? name, next);
  }
  for (const star of model.stars) {
    const destination = project.targets.get(`${path}\0${star.specifier}`);
    if (destination) {
      const found = fnForExport(project, destination, name, next);
      if (found.some((value) => value.kind !== 'unknown')) return found;
    }
  }
  return [unknown];
};
