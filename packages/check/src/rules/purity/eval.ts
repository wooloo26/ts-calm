import { record, text, offset, children, functionNode, effectName } from '#src/core/parser.b';
import { property, unique, unknown, fnForExport } from '#src/rules/purity/values';
import type { Node } from '#src/core/parser.b';
import type { FunctionModel, PurityModel, Binding } from '#src/rules/purity/model';
import { typeKind } from '#src/rules/purity/model';
import type { Value, Frame, Evaluation, Project } from '#src/rules/purity/values';

type Context = Readonly<{
  project: Project;
  evaluation: Evaluation;
  changed: ReadonlySet<string>;
  root: string;
}>;
const arrayMethods = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'copyWithin',
  'fill',
];
const collectionMethods = ['set', 'add', 'delete', 'clear'];
const objectMutators = [
  'Object.freeze',
  'Object.seal',
  'Object.preventExtensions',
  'Object.assign',
  'Object.defineProperty',
  'Object.defineProperties',
  'Reflect.set',
  'Reflect.deleteProperty',
  'Reflect.defineProperty',
];
const callbackMethods = [
  'map',
  'flatMap',
  'filter',
  'forEach',
  'find',
  'findIndex',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'sort',
];
const fpCallbacks: Readonly<Record<string, readonly number[]>> = {
  capture: [0],
  captureAsync: [0],
  captureResult: [0],
  captureResultAsync: [0],
  map: [1],
  flatMap: [1],
  mapError: [1],
  filter: [1, 2],
  findValue: [1],
  andThrough: [1],
  inspect: [1],
  inspectError: [1],
  getOrElse: [1],
  orElse: [1],
  traverse: [1],
  traverseAsync: [1],
  filterMap: [1],
  findMap: [1],
  isUniqueBy: [1],
};
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.map(record) : []);
const literalKey = (node: Node): string => {
  const value = node['value'];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '*';
};
const keyOf = (node: Node): string =>
  node['type'] === 'Identifier' ? text(node, 'name') : literalKey(node);
const modelFor = (context: Context, frame: Frame): PurityModel | false =>
  context.project.models.get(frame.fn.file) ?? false;

/** @impure Record an observed effect in this analysis invocation. */
const effect = (
  context: Context,
  frame: Frame,
  message: string,
  node: Node,
  binding?: string,
): void => {
  const item = {
    message,
    file: frame.fn.file,
    offset: offset(node),
    chain: frame.chain,
    ...(binding ? { binding } : {}),
  };
  context.evaluation.effects.set(
    `${message}:${binding ?? ''}:${frame.fn.file}:${offset(node)}`,
    item,
  );
};

const imported = (context: Context, model: PurityModel, binding: Binding): readonly Value[] => {
  const target = context.project.targets.get(`${model.file.source.path}\0${binding.specifier}`);
  if (target)
    return binding.imported === '*'
      ? [{ kind: 'external', name: `project:${target}` }]
      : fnForExport(context.project, target, binding.imported);
  return [
    {
      kind: 'external',
      name: `${binding.specifier}:${binding.imported === '*' ? '' : binding.imported}`,
    },
  ];
};

const access = (context: Context, values: readonly Value[], key: string): readonly Value[] =>
  unique(
    values.flatMap((value) => {
      if (value.kind === 'external' && value.name.startsWith('project:'))
        return fnForExport(context.project, value.name.slice(8), key);
      return property(value, key, context.project);
    }),
  );

/** @impure Resolve and memoize values in the supplied analysis context. */
const bindingValue = (
  context: Context,
  frame: Frame,
  model: PurityModel,
  binding: Binding,
  seen: ReadonlySet<string>,
): readonly Value[] => {
  const provided = frame.env.get(binding.id);
  if (provided) return provided;
  if (binding.specifier) return imported(context, model, binding);
  const declared = binding.values.flatMap((node) => {
    const id = model.functionNodes.get(offset(node));
    return id ? [{ kind: 'function' as const, id }] : [];
  });
  if (declared.length) return declared;
  if (
    !binding.parameter &&
    !frame.active.has(binding.owner) &&
    ['object', 'array', 'map', 'set'].includes(binding.type) &&
    !seen.has(binding.id)
  ) {
    const alias = binding.values.find((node) => node['type'] === 'Identifier');
    const original = alias ? model.bindings.get(model.refs.get(offset(alias)) ?? '') : false;
    if (original)
      return bindingValue(context, frame, model, original, new Set([...seen, binding.id]));
  }
  if (binding.parameter || !frame.active.has(binding.owner))
    return [{ kind: 'reference', id: binding.id, path: [], shape: binding.type }];
  if (seen.has(binding.id)) return [unknown];
  let values = unique(
    binding.values.flatMap((node) =>
      resolveValue(context, frame, node, new Set([...seen, binding.id])),
    ),
  );
  for (const key of binding.projection) values = access(context, values, key);
  return values.length ? values : [unknown];
};

/** @impure Populate the private allocation table used by one function analysis. */
const fresh = (
  context: Context,
  frame: Frame,
  node: Node,
  seen: ReadonlySet<string>,
): readonly Value[] => {
  const id = `${context.root}:${frame.fn.id}:${offset(node)}:${offset(node, 'end')}`;
  const cached = context.evaluation.fresh.get(id);
  if (cached) return [cached];
  const kind = text(node, 'type'),
    constructor = text(record(node['callee']), 'name');
  const shape =
    kind === 'ArrayExpression'
      ? 'array'
      : kind === 'NewExpression'
        ? constructor.toLowerCase()
        : 'object';
  const value: Value = { kind: 'fresh', id, shape, slots: new Map(), spread: [] };
  context.evaluation.fresh.set(id, value);
  if (kind === 'ArrayExpression')
    nodes(node['elements']).forEach((item, index) => {
      if (item['type'] === 'SpreadElement')
        value.spread.push(...resolveValue(context, frame, record(item['argument']), seen));
      else value.slots.set(String(index), resolveValue(context, frame, item, seen));
    });
  if (kind === 'ObjectExpression')
    for (const item of nodes(node['properties'])) {
      if (item['type'] === 'SpreadElement')
        value.spread.push(...resolveValue(context, frame, record(item['argument']), seen));
      else
        value.slots.set(
          keyOf(record(item['key'])),
          resolveValue(context, frame, record(item['value']), seen),
        );
    }
  return [value];
};

/** @impure Resolve expression origins and record effects in the supplied analysis context. */
export const resolveValue = (
  context: Context,
  frame: Frame,
  node: Node,
  seen: ReadonlySet<string> = new Set(),
): readonly Value[] => {
  const model = modelFor(context, frame);
  if (!model) return [unknown];
  const kind = text(node, 'type');
  if (functionNode(node)) {
    const id = model.functionNodes.get(offset(node));
    return id ? [{ kind: 'function', id }] : [unknown];
  }
  if (kind === 'Identifier') {
    const binding = model.bindings.get(model.refs.get(offset(node)) ?? '');
    return binding
      ? bindingValue(context, frame, model, binding, seen)
      : [{ kind: 'external', name: text(node, 'name') }];
  }
  if (kind === 'MemberExpression')
    return access(
      context,
      resolveValue(context, frame, record(node['object']), seen),
      node['computed'] ? literalKey(record(node['property'])) : keyOf(record(node['property'])),
    );
  if (
    [
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'AwaitExpression',
      'ChainExpression',
    ].includes(kind)
  )
    return resolveValue(context, frame, record(node['expression'] ?? node['argument']), seen);
  if (kind === 'ConditionalExpression')
    return unique([
      ...resolveValue(context, frame, record(node['consequent']), seen),
      ...resolveValue(context, frame, record(node['alternate']), seen),
    ]);
  if (kind === 'LogicalExpression')
    return unique([
      ...resolveValue(context, frame, record(node['left']), seen),
      ...resolveValue(context, frame, record(node['right']), seen),
    ]);
  if (['ArrayExpression', 'ObjectExpression'].includes(kind))
    return fresh(context, frame, node, seen);
  if (kind === 'CallExpression' || kind === 'NewExpression')
    return call(context, frame, node, seen);
  return [unknown];
};

/** @impure Record mutation of externally visible data, retaining private allocation ownership. */
const write = (
  context: Context,
  frame: Frame,
  values: readonly Value[],
  node: Node,
  bindingAssignment = false,
): void => {
  for (const value of values)
    if (value.kind === 'reference') {
      const binding = context.project.bindings.get(value.id);
      if (bindingAssignment && binding?.owner === frame.fn.id) continue;
      context.evaluation.writes.add(value.id);
      effect(
        context,
        frame,
        `modify ${binding?.name ?? value.id}${value.path.length ? `.${value.path.join('.')}` : ''}`,
        node,
        value.id,
      );
    }
};

/** @impure Observe mutable external reads without claiming ordinary input reads are effects. */
const read = (context: Context, frame: Frame, node: Node): void => {
  for (const value of resolveValue(context, frame, node)) {
    if (value.kind === 'external') {
      const name = value.name.replace(/^globalThis\./, '');
      if (
        name.startsWith('process.') ||
        name.startsWith('node:process:') ||
        name.startsWith('process:')
      )
        effect(context, frame, `read ${name}`, node);
    }
    if (value.kind === 'reference') {
      const binding = context.project.bindings.get(value.id);
      if (binding && !binding.parameter && (binding.mutable || context.changed.has(binding.id)))
        effect(context, frame, `read changing ${binding.name}`, node, binding.id);
    }
  }
};

/** @impure Inspect known calls and append effects to the supplied analysis context. */
const invoke = (
  context: Context,
  frame: Frame,
  values: readonly Value[],
  args: readonly (readonly Value[])[],
  node: Node,
): readonly Value[] =>
  unique(
    values.flatMap((value) => {
      if (value.kind === 'function') return evaluateFunction(context, value.id, args, frame);
      if (value.kind === 'external') {
        const name = value.name.replace(/^globalThis\./, '');
        const known = effectName(name, context.project.custom);
        if (known) effect(context, frame, known, node);
        if (name === 'Date' && (node['type'] === 'CallExpression' || args.length === 0))
          effect(context, frame, 'current time', node);
        const match = /^ts-calm(?:\/boundary)?:([^.]+)$/.exec(name);
        if (match)
          for (const index of fpCallbacks[match[1] ?? ''] ?? [])
            invoke(context, frame, args[index] ?? [], [[unknown]], node);
        return [{ kind: 'external' as const, name: `${name}()` }];
      }
      return [unknown];
    }),
  );

/** @impure Update private collection provenance after a modeled mutating operation. */
const mutateCollection = (
  context: Context,
  frame: Frame,
  receiver: readonly Value[],
  method: string,
  args: readonly (readonly Value[])[],
  node: Node,
): void => {
  write(context, frame, receiver, node);
  for (const value of receiver)
    if (value.kind === 'fresh' && ['push', 'unshift', 'splice', 'set', 'add'].includes(method)) {
      const inserted = method === 'set' ? (args[1] ?? []) : args.flat();
      value.slots.set('*', unique([...(value.slots.get('*') ?? []), ...inserted]));
    }
};

/** @impure Evaluate a known call in the current analysis context. */
const call = (
  context: Context,
  frame: Frame,
  node: Node,
  seen: ReadonlySet<string>,
): readonly Value[] => {
  const cache = `${offset(node)}:${offset(node, 'end')}`;
  const perFrame = cachedCalls(context, frame);
  const cached = perFrame.site.get(cache);
  if (cached) return cached;
  if (perFrame.active.has(cache)) return [unknown];
  perFrame.active.add(cache);
  const callee = record(node['callee']),
    args = nodes(node['arguments']).map((arg) => resolveValue(context, frame, arg, seen));
  const targets = resolveValue(context, frame, callee, seen);
  let result: readonly Value[] = [unknown];
  const globalName = targets.find((value) => value.kind === 'external');
  const name = globalName?.kind === 'external' ? globalName.name : '';
  if (node['type'] === 'NewExpression' && ['Map', 'Set', 'Array', 'Date'].includes(name)) {
    result = fresh(context, frame, node, seen);
    if (name === 'Date' && args.length === 0) effect(context, frame, 'current time', node);
  } else if (objectMutators.includes(name)) {
    write(context, frame, args[0] ?? [], node);
    result = args[0] ?? [unknown];
    if (name === 'Object.assign')
      for (const value of result)
        if (value.kind === 'fresh') value.spread.push(...args.slice(1).flat());
  } else {
    result = invoke(context, frame, targets, args, node);
    if (callee['type'] === 'MemberExpression') {
      const receiver = resolveValue(context, frame, record(callee['object']), seen),
        method = keyOf(record(callee['property']));
      const collections = receiver.filter(
        (value) =>
          (value.kind === 'fresh' || value.kind === 'reference' || value.kind === 'unknown') &&
          ['array', 'map', 'set'].includes(value.shape ?? ''),
      );
      if (collections.length) {
        if (arrayMethods.includes(method) || collectionMethods.includes(method))
          mutateCollection(context, frame, collections, method, args, node);
        if (callbackMethods.includes(method))
          invoke(
            context,
            frame,
            args[0] ?? [],
            [access(context, collections, '*'), [unknown]],
            node,
          );
        if (['get', 'at', 'pop', 'shift', 'find'].includes(method))
          result = access(context, collections, '*');
        if (['slice', 'toSorted', 'toReversed', 'filter', 'map', 'flatMap'].includes(method)) {
          const allocated = fresh(
            context,
            frame,
            {
              type: 'ArrayExpression',
              start: offset(node),
              end: offset(node, 'end'),
              elements: [],
            },
            seen,
          );
          for (const value of allocated)
            if (value.kind === 'fresh') value.slots.set('*', access(context, collections, '*'));
          result = allocated;
        }
      }
      if (
        ['then', 'catch', 'finally'].includes(method) &&
        receiver.some(
          (value) =>
            (value.kind === 'reference' || value.kind === 'fresh') && value.shape === 'promise',
        )
      )
        for (const arg of args) invoke(context, frame, arg, [[unknown]], node);
    }
  }
  perFrame.active.delete(cache);
  perFrame.site.set(cache, result);
  return result;
};

/** @impure Read or create the per-invocation call cache of the supplied analysis context. */
const cachedCalls = (
  context: Context,
  frame: Frame,
): Readonly<{ site: Map<string, readonly Value[]>; active: Set<string> }> => {
  const site = context.evaluation.calls.get(frame);
  const active = context.evaluation.activeCalls.get(frame);
  if (site && active) return { site, active };
  const created = {
    site: site ?? new Map<string, readonly Value[]>(),
    active: active ?? new Set<string>(),
  };
  context.evaluation.calls.set(frame, created.site);
  context.evaluation.activeCalls.set(frame, created.active);
  return created;
};

/** @impure Traverse one body and collect observed effects in its private analysis result. */
const visit = (context: Context, frame: Frame, node: Node, parent: Node, key: string): void => {
  const kind = text(node, 'type');
  if (functionNode(node)) return;
  if (kind === 'CallExpression' || kind === 'NewExpression') call(context, frame, node, new Set());
  if (
    kind === 'AssignmentExpression' ||
    kind === 'UpdateExpression' ||
    (kind === 'UnaryExpression' && node['operator'] === 'delete')
  ) {
    const target = record(node['left'] ?? node['argument']);
    if (target['type'] === 'Identifier') {
      const model = modelFor(context, frame),
        binding = model ? model.bindings.get(model.refs.get(offset(target)) ?? '') : false;
      if (binding && !frame.active.has(binding.owner))
        write(
          context,
          frame,
          [{ kind: 'reference', id: binding.id, path: [], shape: binding.type }],
          node,
          true,
        );
    } else write(context, frame, resolveValue(context, frame, target), node);
  }
  const isKey =
    (key === 'property' && !parent['computed']) ||
    (key === 'key' && !parent['computed']) ||
    key === 'id' ||
    key === 'typeAnnotation';
  if ((kind === 'Identifier' && !isKey) || kind === 'MemberExpression') read(context, frame, node);
  for (const child of children(node))
    if (child.key !== 'typeAnnotation') visit(context, frame, child.node, node, child.key);
};

/** @impure Track calls and their externally visible effects for a single root function. */
export const evaluateFunction = (
  context: Context,
  id: string,
  args: readonly (readonly Value[])[] = [],
  caller?: Frame,
): readonly Value[] => {
  const fn = context.project.functions.get(id);
  if (!fn || caller?.active.has(id)) return [unknown];
  const env = new Map(caller?.env);
  for (const parameter of fn.params) {
    let value = args[parameter.index];
    if (value) for (const key of parameter.path) value = access(context, value, key);
    if (value) env.set(parameter.binding, value);
  }
  const frame: Frame = {
    fn,
    env,
    active: new Set([...(caller?.active ?? []), id]),
    chain: [...(caller?.chain ?? []), `${fn.file}:${fn.name || '<callback>'}`],
  };
  context.evaluation.executed.add(id);
  nodes(fn.node['params']).forEach((parameter, index) => {
    const supplied = args[index];
    if (
      parameter['type'] !== 'AssignmentPattern' ||
      (caller &&
        supplied &&
        !supplied.some((value) => value.kind === 'external' && value.name === 'undefined'))
    )
      return;
    const initial = record(parameter['right']);
    visit(context, frame, initial, parameter, 'right');
    for (const parameterBinding of fn.params.filter((item) => item.index === index)) {
      let values = resolveValue(context, frame, initial);
      for (const key of parameterBinding.path) values = access(context, values, key);
      const binding = context.project.bindings.get(parameterBinding.binding);
      if (!caller && binding)
        values = unique([
          { kind: 'reference', id: binding.id, path: [], shape: binding.type },
          ...values,
        ]);
      env.set(parameterBinding.binding, values);
    }
  });
  visit(context, frame, fn.body, {}, '');
  const returned: Value[] = [];
  /** @impure Append return origins to the current private analysis buffer. */
  const collect = (node: Node): void => {
    if (functionNode(node)) return;
    if (node['type'] === 'ReturnStatement')
      returned.push(...resolveValue(context, frame, record(node['argument'])));
    for (const child of children(node)) collect(child.node);
  };
  if (fn.body['type'] === 'BlockStatement') collect(fn.body);
  else returned.push(...resolveValue(context, frame, fn.body));
  if (context.project.declared.has(fn.id) && caller)
    effect(context, frame, `declared effect: ${fn.reason}`, fn.node);
  const shape = typeKind(record(fn.node['returnType']));
  return unique(
    (returned.length ? returned : [unknown]).map((value) =>
      shape && value.kind === 'unknown' ? { ...value, shape } : value,
    ),
  );
};

export const evaluatePurity = (
  project: Project,
  fn: FunctionModel,
  changed: ReadonlySet<string>,
): Evaluation => {
  const evaluation: Evaluation = {
    effects: new Map(),
    writes: new Set(),
    executed: new Set(),
    fresh: new Map(),
    calls: new Map(),
    activeCalls: new Map(),
  };
  evaluateFunction({ project, evaluation, root: fn.id, changed }, fn.id);
  return evaluation;
};
