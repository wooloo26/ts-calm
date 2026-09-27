import { functionNode, offset, record, text } from '#src/core/parser';
import type { Node } from '#src/core/parser';
import type { Binding, PurityModel } from '#src/rules/purity/model';
import { evaluateFp } from '#src/rules/purity/fp';
import { passiveFp } from '#src/rules/purity/fp-contracts';
import { literalValue, property, unique, unknown } from '#src/rules/purity/values';
import type { FreshValue, Project, Value } from '#src/rules/purity/values';

type Values = readonly Value[];
export type RetainedContext = Readonly<{
  project: Project;
  cache: Map<string, Values>;
  unsupported: Set<string>;
}>;
type Location = Readonly<{ model: PurityModel; owner: string; seen: ReadonlySet<string> }>;
const members = (value: unknown): readonly Node[] =>
  Array.isArray(value) ? value.map(record) : [];
const keyOf = (node: Node): string => {
  const value = node['value'];
  return node['type'] === 'Identifier'
    ? text(node, 'name')
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '*';
};
/** @impure Cache exported constants while following their properties. */
const read = (context: RetainedContext, values: Values, key: string): Values =>
  unique(
    values.flatMap((value) =>
      value.kind === 'external' && value.name.startsWith('project:')
        ? retainedExport(context, value.name.slice(8), { name: key, seen: new Set() }) || [unknown]
        : property(value, key, context.project),
    ),
  );

/** @impure Cache a structural view of module-owned values without executing their initializers. */
const bindingValue = (
  context: RetainedContext,
  binding: Binding,
  location: Location,
): Values | false => {
  const { model, seen } = location;
  const functions = binding.values.flatMap((node) => {
    const id = model.functionNodes.get(offset(node));
    return id ? [{ kind: 'function' as const, id }] : [];
  });
  if (functions.length) return functions;
  if (binding.specifier) {
    const target = context.project.targets.get(`${model.file.source.path}\0${binding.specifier}`);
    if (target)
      return binding.imported === '*'
        ? [{ kind: 'external', name: `project:${target}` }]
        : retainedExport(context, target, { name: binding.imported, seen });
    return [
      {
        kind: 'external',
        name: `${binding.specifier}:${binding.imported === '*' ? '' : binding.imported}`,
      },
    ];
  }
  if (binding.parameter || binding.mutable || binding.owner !== model.module) return false;
  const cached = context.cache.get(binding.id);
  if (cached) return cached;
  if (seen.has(binding.id)) return false;
  context.cache.set(binding.id, [unknown]);
  const next = { model, owner: binding.id, seen: new Set([...seen, binding.id]) };
  const values: Value[] = [];
  for (const node of binding.values) {
    const value = expression(context, node, next);
    if (!value) {
      context.cache.delete(binding.id);
      return false;
    }
    values.push(...value);
  }
  if (!values.length) {
    context.cache.delete(binding.id);
    return false;
  }
  let result = unique(values);
  for (const key of binding.projection) result = read(context, result, key);
  context.cache.set(binding.id, result);
  return result;
};

/** @impure Build shared object slots; supplied functions remain unevaluated values. */
const aggregate = (context: RetainedContext, node: Node, location: Location): Values => {
  const array = node['type'] === 'ArrayExpression';
  const value: FreshValue = {
    kind: 'fresh',
    owner: location.owner,
    id: `retained:${location.model.file.source.path}:${offset(node)}`,
    shape: array ? 'array' : 'object',
    slots: new Map(),
    spread: [],
  };
  for (const [index, item] of members(node[array ? 'elements' : 'properties']).entries()) {
    if (item['type'] === 'SpreadElement')
      value.spread.push(...(expression(context, record(item['argument']), location) || [unknown]));
    else if (array)
      value.slots.set(String(index), expression(context, item, location) || [unknown]);
    else {
      const key = record(item['key']);
      const name = item['computed'] && key['type'] !== 'Literal' ? '*' : keyOf(key);
      if (item['kind'] === 'get' || item['kind'] === 'set') {
        context.unsupported.add(
          `Accessor in retained initializer: ${location.model.file.source.path}`,
        );
        value.slots.set(name, [unknown]);
      } else
        value.slots.set(name, expression(context, record(item['value']), location) || [unknown]);
    }
  }
  return [value];
};

/** @impure Interpret passive fp constructors only; arbitrary module calls are never replayed. */
const application = (context: RetainedContext, node: Node, location: Location): Values | false => {
  const targets = expression(context, record(node['callee']), location);
  if (!targets) return false;
  const names = targets.flatMap((value) => {
    const match =
      value.kind === 'external' ? /^@ts-calm\/fp(?:\/boundary)?:([^.]+)$/.exec(value.name) : false;
    return match && match[1] ? [match[1]] : [];
  });
  if (!names.length) return false;
  if (names.some((name) => !passiveFp(name))) {
    context.unsupported.add(`Unsupported retained fp initializer: ${names.join(', ')}`);
    return [unknown];
  }
  const args = members(node['arguments']).map(
    /** @impure Record arguments whose retained origins could not be resolved. */ (argument) => {
      const value = expression(context, argument, location);
      if (!value)
        context.unsupported.add(
          `Unmodeled argument in retained fp initializer: ${names.join(', ')}`,
        );
      return value || [unknown];
    },
  );
  return names.flatMap(
    /** @impure Record incomplete analysis and cache nested module values. */ (name) =>
      evaluateFp(name, args, {
        /** @impure Report an unexpected callback contract without invoking its body. */
        call: () => {
          context.unsupported.add(`Callback in retained fp initializer: ${name}`);
          return [unknown];
        },
        read: (values, key) => read(context, values, key),
        allocate: (shape, slots, discriminator = '') => [
          {
            kind: 'fresh',
            owner: location.owner,
            id: `retained:${location.model.file.source.path}:${offset(node)}:${shape}:${discriminator}`,
            shape,
            slots: new Map(Object.entries(slots)),
            spread: [],
          },
        ],
        /** @impure Retain the reason an fp result could not be modeled. */
        incomplete: (reason) => {
          context.unsupported.add(reason);
        },
      }),
  );
};

/** @impure Resolve static aliases and data expressions while retaining shared allocation identity. */
const expression = (context: RetainedContext, node: Node, location: Location): Values | false => {
  const kind = text(node, 'type'),
    { model } = location;
  if (functionNode(node)) {
    const id = model.functionNodes.get(offset(node));
    return id ? [{ kind: 'function', id }] : false;
  }
  if (kind === 'Literal') {
    return [literalValue(node['value'])];
  }
  if (kind === 'Identifier') {
    const binding = model.bindings.get(model.refs.get(offset(node)) ?? '');
    return binding
      ? bindingValue(context, binding, location)
      : [{ kind: 'external', name: text(node, 'name') }];
  }
  if (kind === 'MemberExpression') {
    const owner = expression(context, record(node['object']), location);
    const key = record(node['property']);
    return owner
      ? read(context, owner, node['computed'] && key['type'] !== 'Literal' ? '*' : keyOf(key))
      : false;
  }
  if (
    [
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'ChainExpression',
      'AwaitExpression',
    ].includes(kind)
  )
    return expression(context, record(node['expression'] ?? node['argument']), location);
  if (kind === 'ObjectExpression' || kind === 'ArrayExpression')
    return aggregate(context, node, location);
  if (kind === 'ConditionalExpression' || kind === 'LogicalExpression') {
    const left = record(node[kind === 'ConditionalExpression' ? 'consequent' : 'left']);
    const right = record(node[kind === 'ConditionalExpression' ? 'alternate' : 'right']);
    return unique([
      ...(expression(context, left, location) || [unknown]),
      ...(expression(context, right, location) || [unknown]),
    ]);
  }
  if (kind === 'CallExpression') return application(context, node, location);
  return false;
};

/** @impure Read a constant declared in this model's module scope. */
export const retainedBinding = (
  context: RetainedContext,
  model: PurityModel,
  binding: Binding,
): Values | false => bindingValue(context, binding, { model, owner: binding.id, seen: new Set() });

/** @impure Follow source exports and re-exports, preserving constants as well as functions. */
export const retainedExport = (
  context: RetainedContext,
  path: string,
  { name, seen }: Readonly<{ name: string; seen: ReadonlySet<string> }>,
): Values | false => {
  const key = `export:${path}:${name}`;
  if (seen.has(key)) return false;
  const model = context.project.models.get(path);
  if (!model) return false;
  const next = new Set([...seen, key]),
    target = model.exports.get(name);
  if (target?.binding) {
    if (context.project.functions.has(target.binding))
      return [{ kind: 'function', id: target.binding }];
    const binding = model.bindings.get(target.binding);
    if (binding) return bindingValue(context, binding, { model, owner: binding.id, seen: next });
  }
  if (target?.specifier) {
    const destination = context.project.targets.get(`${path}\0${target.specifier}`);
    if (destination)
      return retainedExport(context, destination, { name: target.name ?? name, seen: next });
  }
  for (const star of model.stars) {
    const destination = context.project.targets.get(`${path}\0${star.specifier}`);
    const value = destination ? retainedExport(context, destination, { name, seen: next }) : false;
    if (value) return value;
  }
  return false;
};
