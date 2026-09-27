import { record, text, children } from '#src/core/parser';
import { typeKind } from '#src/rules/purity/model';
import type { Node } from '#src/core/parser';
import type { PurityModel, FunctionModel, Binding } from '#src/rules/purity/model';

export type FreshValue = Readonly<{
  kind: 'fresh';
  id: string;
  shape: string;
  slots: Map<string, readonly Value[]>;
  spread: Value[];
  /** A module-owned allocation is shared even though its slots are statically known. */
  owner?: string;
}>;
export type Value =
  | Readonly<{ kind: 'unknown'; shape?: string }>
  | Readonly<{ kind: 'literal'; value: 'ok' | 'error' | boolean }>
  | Readonly<{ kind: 'function'; id: string }>
  | Readonly<{ kind: 'external'; name: string }>
  | Readonly<{ kind: 'reference'; id: string; path: readonly string[]; shape: string }>
  | Readonly<{
      kind: 'container';
      variant: 'ok' | 'err' | 'some' | 'none';
      payload: readonly Value[];
    }>
  | Readonly<{ kind: 'decoder'; callbacks: readonly Value[] }>
  | Readonly<{ kind: 'decoder-call'; callbacks: readonly Value[] }>
  | FreshValue;
export type Frame = Readonly<{
  fn: FunctionModel;
  env: ReadonlyMap<string, readonly Value[]>;
  active: ReadonlySet<string>;
  chain: readonly string[];
  summary: string;
  allocation: number;
  allocations: ReadonlyMap<string, number>;
}>;
export type FunctionSummary = {
  id: string;
  args: readonly (readonly Value[])[];
  caller?: Frame;
  values: readonly Value[];
  active: boolean;
  ready: boolean;
  reusable: boolean;
  recursive: boolean;
  invalidated: boolean;
  dependents: Set<string>;
  recursion: string;
  revision: number;
};
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
  calls: Map<Frame, Map<string, readonly Value[]>>;
  activeCalls: Map<Frame, Set<string>>;
  summaries: Map<string, FunctionSummary>;
  pending: Set<string>;
  stack: string[];
  expansions: number;
  cacheHits: number;
  revision: number;
  reads: Set<string>;
  incomplete: boolean;
  unsupported: Set<string>;
  retained: Map<string, readonly Value[]>;
};
export type Project = Readonly<{
  models: ReadonlyMap<string, PurityModel>;
  functions: ReadonlyMap<string, FunctionModel>;
  bindings: ReadonlyMap<string, Binding>;
  owners: ReadonlyMap<string, PurityModel>;
  targets: ReadonlyMap<string, string>;
  custom: readonly string[];
  declared: ReadonlySet<string>;
}>;
export const unknown: Value = { kind: 'unknown' };
/** Only DTO discriminants need literal precision; other primitives keep the existing coarse model. */
export const literalValue = (value: unknown): Value =>
  value === 'ok' || value === 'error' || typeof value === 'boolean'
    ? { kind: 'literal', value }
    : unknown;
export const valueKey = (value: Value, depth = 0): string =>
  depth > 8
    ? '?'
    : value.kind === 'literal'
      ? `literal:${JSON.stringify(value.value)}`
      : value.kind === 'container'
        ? `${value.variant}(${value.payload.map((item) => valueKey(item, depth + 1)).join(',')})`
        : value.kind === 'decoder' || value.kind === 'decoder-call'
          ? `${value.kind}(${value.callbacks.map((item) => valueKey(item, depth + 1)).join(',')})`
          : value.kind === 'reference'
            ? `${value.id}.${value.path.join('.')}`
            : value.kind === 'function' || value.kind === 'fresh'
              ? value.id
              : value.kind === 'external'
                ? value.name
                : `?${value.shape ?? ''}`;
export const unique = (values: readonly Value[]): readonly Value[] => {
  if (values.length < 2) return values;
  const seen = new Map<string, Value>();
  for (const value of values) seen.set(valueKey(value), value);
  return [...seen.values()];
};

const expand = (
  node: Node,
  model: PurityModel,
  { project, seen = new Set<string>() }: Readonly<{ project: Project; seen?: Set<string> }>,
): Readonly<{ node: Node; model: PurityModel }> => {
  if (node['type'] === 'TSTypeAnnotation' || node['type'] === 'TSTypeOperator')
    return expand(record(node['typeAnnotation']), model, { project, seen });
  const name = text(record(node['typeName']), 'name');
  const key = `${model.file.source.path}:${name}`;
  if (['Readonly', 'Partial', 'Required'].includes(name)) {
    const parameters = record(node['typeArguments'] ?? node['typeParameters']);
    const first = children(parameters)[0]?.node;
    if (first) return expand(first, model, { project, seen });
  }
  if (name && !seen.has(key)) {
    if (model.typeDefs.has(name))
      return expand(model.typeDefs.get(name) ?? {}, model, {
        project,
        seen: new Set([...seen, key]),
      });
    const imported = model.importsByName.get(name);
    const target = imported
      ? project.targets.get(`${model.file.source.path}\0${imported.specifier}`)
      : '';
    const other = target ? project.models.get(target) : false;
    if (other && imported)
      return expand(other.typeDefs.get(imported.imported) ?? {}, other, {
        project,
        seen: new Set([...seen, key]),
      });
  }
  return { node, model };
};

export const referenceShape = (
  binding: Binding,
  path: readonly string[],
  { model, project }: Readonly<{ model: PurityModel; project: Project }>,
): string => {
  let current = expand(binding.annotation, model, { project });
  for (const key of path) {
    const typeName = record(current.node['typeName']);
    const name = text(typeName, 'name') || text(record(typeName['right']), 'name');
    const local = text(record(typeName['left']), 'name') || name;
    const imported = current.model.importsByName.get(local);
    if (
      imported?.specifier === '@ts-calm/fp' &&
      ['Result', 'AsyncResult', 'Option', 'Ok', 'Err', 'Some'].includes(name) &&
      (key === 'value' || key === 'error')
    ) {
      const argumentsNode = record(current.node['typeArguments'] ?? current.node['typeParameters']);
      const index = key === 'error' && name !== 'Err' ? 1 : 0;
      current = expand(children(argumentsNode)[index]?.node ?? {}, current.model, { project });
      continue;
    }
    if (typeKind(current.node) === 'array' && (key === '*' || /^\d+$/.test(key))) {
      const argumentsNode = record(current.node['typeArguments'] ?? current.node['typeParameters']);
      const element = record(current.node['elementType'] ?? children(argumentsNode)[0]?.node);
      current = expand(element, current.model, { project });
      continue;
    }
    const property = children(current.node)
      .map((entry) => entry.node)
      .find((entry) => text(record(entry['key']), 'name') === key);
    current = expand(record(property?.['typeAnnotation']), current.model, { project });
  }
  return typeKind(current.node) || (path.length === 0 ? binding.type : '');
};

export const property = (value: Value, key: string, project: Project): readonly Value[] => {
  if (value.kind === 'decoder' && key === 'parse')
    return [{ kind: 'decoder-call', callbacks: value.callbacks }];
  if (value.kind === 'external')
    return [
      { kind: 'external', name: `${value.name}${value.name.endsWith(':') ? '' : '.'}${key}` },
    ];
  if (value.kind === 'reference') {
    const binding = project.bindings.get(value.id);
    const ownerModel = project.owners.get(value.id);
    const path = [...value.path, key].slice(0, 8);
    return [
      {
        ...value,
        path,
        shape:
          binding && ownerModel
            ? referenceShape(binding, path, { model: ownerModel, project })
            : '',
      },
    ];
  }
  if (value.kind === 'fresh') {
    if (key === '*') {
      const values = unique(
        [...value.slots.values()]
          .flat()
          .concat(value.spread.flatMap((entry) => property(entry, key, project))),
      );
      return values.length ? values : [unknown];
    }
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
  { name, seen = new Set<string>() }: Readonly<{ name: string; seen?: Set<string> }>,
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
      if (destination)
        return fnForExport(project, destination, { name: binding.imported, seen: next });
    }
  }
  if (target?.specifier) {
    const destination = project.targets.get(`${path}\0${target.specifier}`);
    if (destination)
      return fnForExport(project, destination, { name: target.name ?? name, seen: next });
  }
  for (const star of model.stars) {
    const destination = project.targets.get(`${path}\0${star.specifier}`);
    if (destination) {
      const found = fnForExport(project, destination, { name, seen: next });
      if (found.some((value) => value.kind !== 'unknown')) return found;
    }
  }
  return [unknown];
};
