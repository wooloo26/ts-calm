import { record, text, offset, children, functionNode, effectName } from '#src/core/parser';
import { property, unique, unknown, fnForExport, referenceShape } from '#src/rules/purity/values';
import type { Node } from '#src/core/parser';
import type { FunctionModel, PurityModel, Binding } from '#src/rules/purity/model';
import { typeKind } from '#src/rules/purity/model';
import { summaryContext, reusableReturn, sameValues } from '#src/rules/purity/summaries';
import type { Value, Frame, Evaluation, Project } from '#src/rules/purity/values';

type Context = Readonly<{
  project: Project;
  evaluation: Evaluation;
  changed: ReadonlySet<string>;
  root: string;
  maximumExpansions: number;
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
const branchingNodes = [
  'IfStatement',
  'ConditionalExpression',
  'LogicalExpression',
  'SwitchStatement',
  'ForStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
];
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
  'toSorted',
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
  { message, node, binding }: Readonly<{ message: string; node: Node; binding?: string }>,
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
      : fnForExport(context.project, target, { name: binding.imported });
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
        return fnForExport(context.project, value.name.slice(8), { name: key });
      return property(value, key, context.project);
    }),
  );

/** @impure Resolve and memoize values in the supplied analysis context. */
const bindingValue = (
  context: Context,
  frame: Frame,
  {
    model,
    binding,
    seen,
  }: Readonly<{ model: PurityModel; binding: Binding; seen: ReadonlySet<string> }>,
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
      return bindingValue(context, frame, {
        model,
        binding: original,
        seen: new Set([...seen, binding.id]),
      });
  }
  if (binding.parameter || !frame.active.has(binding.owner))
    return [
      {
        kind: 'reference',
        id: binding.id,
        path: [],
        shape: referenceShape(binding, [], { model, project: context.project }),
      },
    ];
  if (seen.has(binding.id)) return [unknown];
  let values = unique(
    binding.values.flatMap((node) =>
      resolveValue(context, frame, { node, seen: new Set([...seen, binding.id]) }),
    ),
  );
  for (const key of binding.projection) values = access(context, values, key);
  return values.length ? values : [unknown];
};

/** @impure Populate the private allocation table used by one function analysis. */
const fresh = (
  context: Context,
  frame: Frame,
  { node, seen }: Readonly<{ node: Node; seen: ReadonlySet<string> }>,
): readonly Value[] => {
  const owner = modelFor(context, frame);
  const scope = owner ? (owner.nodeOwners.get(offset(node)) ?? frame.fn.id) : frame.fn.id;
  const allocation = frame.allocations.get(scope) ?? frame.allocation;
  const id = `${context.root}:${allocation}:${scope}:${offset(node)}:${offset(node, 'end')}`;
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
        value.spread.push(
          ...resolveValue(context, frame, { node: record(item['argument']), seen }),
        );
      else value.slots.set(String(index), resolveValue(context, frame, { node: item, seen }));
    });
  if (kind === 'ObjectExpression')
    for (const item of nodes(node['properties'])) {
      if (item['type'] === 'SpreadElement')
        value.spread.push(
          ...resolveValue(context, frame, { node: record(item['argument']), seen }),
        );
      else
        value.slots.set(
          keyOf(record(item['key'])),
          resolveValue(context, frame, { node: record(item['value']), seen }),
        );
    }
  return [value];
};

/** @impure Resolve expression origins and record effects in the supplied analysis context. */
export const resolveValue = (
  context: Context,
  frame: Frame,
  { node, seen = new Set() }: Readonly<{ node: Node; seen?: ReadonlySet<string> }>,
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
      ? bindingValue(context, frame, { model, binding, seen })
      : [{ kind: 'external', name: text(node, 'name') }];
  }
  if (kind === 'MemberExpression')
    return access(
      context,
      resolveValue(context, frame, { node: record(node['object']), seen }),
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
    return resolveValue(context, frame, {
      node: record(node['expression'] ?? node['argument']),
      seen,
    });
  if (kind === 'ConditionalExpression')
    return unique([
      ...resolveValue(context, frame, { node: record(node['consequent']), seen }),
      ...resolveValue(context, frame, { node: record(node['alternate']), seen }),
    ]);
  if (kind === 'LogicalExpression')
    return unique([
      ...resolveValue(context, frame, { node: record(node['left']), seen }),
      ...resolveValue(context, frame, { node: record(node['right']), seen }),
    ]);
  if (['ArrayExpression', 'ObjectExpression'].includes(kind))
    return fresh(context, frame, { node, seen });
  if (kind === 'CallExpression' || kind === 'NewExpression')
    return call(context, frame, { node, seen });
  return [unknown];
};

/** @impure Record mutation of externally visible data, retaining private allocation ownership. */
const write = (
  context: Context,
  frame: Frame,
  {
    values,
    node,
    bindingAssignment = false,
  }: Readonly<{ values: readonly Value[]; node: Node; bindingAssignment?: boolean }>,
): void => {
  for (const value of values)
    if (value.kind === 'reference') {
      const binding = context.project.bindings.get(value.id);
      if (bindingAssignment && binding?.owner === frame.fn.id) continue;
      context.evaluation.writes.add(value.id);
      effect(context, frame, {
        message: `modify ${binding?.name ?? value.id}${value.path.length ? `.${value.path.join('.')}` : ''}`,
        node,
        ...(value.id ? { binding: value.id } : {}),
      });
    }
};

/** @impure Observe mutable external reads without claiming ordinary input reads are effects. */
const read = (context: Context, frame: Frame, node: Node): void => {
  for (const value of resolveValue(context, frame, { node })) {
    if (value.kind === 'external') {
      const name = value.name.replace(/^globalThis\./, '');
      if (
        name.startsWith('process.') ||
        name.startsWith('node:process:') ||
        name.startsWith('process:')
      )
        effect(context, frame, { message: `read ${name}`, node });
    }
    if (value.kind === 'reference') {
      const binding = context.project.bindings.get(value.id);
      context.evaluation.reads.add(value.id);
      if (binding && !binding.parameter && (binding.mutable || context.changed.has(binding.id)))
        effect(context, frame, {
          message: `read changing ${binding.name}`,
          node,
          ...(binding.id ? { binding: binding.id } : {}),
        });
    }
  }
};

/** @impure Inspect known calls and append effects to the supplied analysis context. */
const invoke = (
  context: Context,
  frame: Frame,
  {
    values,
    args,
    node,
  }: Readonly<{ values: readonly Value[]; args: readonly (readonly Value[])[]; node: Node }>,
): readonly Value[] =>
  unique(
    values.flatMap(
      /** @impure Evaluate calls using the supplied mutable analysis context. */ (value) => {
        if (value.kind === 'function')
          return evaluateFunction(context, value.id, { args, ...(frame ? { caller: frame } : {}) });
        if (value.kind === 'external') {
          const name = value.name.replace(/^globalThis\./, '');
          const known = effectName(name, context.project.custom);
          if (known) effect(context, frame, { message: known, node });
          if (name === 'Date' && (node['type'] === 'CallExpression' || args.length === 0))
            effect(context, frame, { message: 'current time', node });
          const match = /^@ts-calm\/fp(?:\/boundary)?:([^.]+)$/.exec(name);
          if (match)
            for (const index of fpCallbacks[match[1] ?? ''] ?? [])
              invoke(context, frame, { values: args[index] ?? [], args: [[unknown]], node });
          return [{ kind: 'external' as const, name: `${name}()` }];
        }
        return [unknown];
      },
    ),
  );

/** @impure Update private collection provenance after a modeled mutating operation. */
const mutateCollection = (
  context: Context,
  frame: Frame,
  {
    receiver,
    method,
    args,
    node,
  }: Readonly<{
    receiver: readonly Value[];
    method: string;
    args: readonly (readonly Value[])[];
    node: Node;
  }>,
): void => {
  context.evaluation.revision += 1;
  write(context, frame, { values: receiver, node });
  for (const value of receiver)
    if (value.kind === 'fresh' && ['push', 'unshift', 'splice', 'set', 'add'].includes(method)) {
      const inserted = method === 'set' ? (args[1] ?? []) : args.flat();
      value.slots.set('*', unique([...(value.slots.get('*') ?? []), ...inserted]));
    }
};

/** @impure Register a new collection result in the current analysis allocation table. */
const collectionResult = (
  context: Context,
  frame: Frame,
  {
    node,
    elements,
    seen,
  }: Readonly<{ node: Node; elements: readonly Value[]; seen: ReadonlySet<string> }>,
): readonly Value[] => {
  const allocated = fresh(context, frame, {
    node: {
      type: 'ArrayExpression',
      start: offset(node),
      end: offset(node, 'end'),
      elements: [],
    },
    seen,
  });
  for (const value of allocated) if (value.kind === 'fresh') value.slots.set('*', elements);
  return allocated;
};

const collectionArguments = (
  context: Context,
  method: string,
  {
    collections,
    args,
  }: Readonly<{ collections: readonly Value[]; args: readonly (readonly Value[])[] }>,
): readonly (readonly Value[])[] => {
  const elements = access(context, collections, '*');
  if (method === 'sort' || method === 'toSorted') return [elements, elements];
  if (method === 'reduce' || method === 'reduceRight')
    return [args[1] ?? elements, elements, [unknown], collections];
  return [elements, [unknown], collections];
};

/** @impure Evaluate a known call in the current analysis context. */
const call = (
  context: Context,
  frame: Frame,
  { node, seen }: Readonly<{ node: Node; seen: ReadonlySet<string> }>,
): readonly Value[] => {
  const cache = `${offset(node)}:${offset(node, 'end')}`;
  const perFrame = cachedCalls(context, frame);
  const cached = perFrame.site.get(cache);
  if (cached) return cached;
  if (perFrame.active.has(cache)) return [unknown];
  perFrame.active.add(cache);
  const callee = record(node['callee']),
    args = nodes(node['arguments']).map((arg) => resolveValue(context, frame, { node: arg, seen }));
  const targets = resolveValue(context, frame, { node: callee, seen });
  let result: readonly Value[] = [unknown];
  const globalName = targets.find((value) => value.kind === 'external');
  const name = globalName?.kind === 'external' ? globalName.name : '';
  if (node['type'] === 'NewExpression' && ['Map', 'Set', 'Array', 'Date'].includes(name)) {
    result = fresh(context, frame, { node, seen });
    if (name === 'Date' && args.length === 0)
      effect(context, frame, { message: 'current time', node });
  } else if (objectMutators.includes(name)) {
    context.evaluation.revision += 1;
    write(context, frame, { values: args[0] ?? [], node });
    result = args[0] ?? [unknown];
    if (name === 'Object.assign')
      for (const value of result)
        if (value.kind === 'fresh') value.spread.push(...args.slice(1).flat());
  } else {
    result = invoke(context, frame, { values: targets, args, node });
    if (callee['type'] === 'MemberExpression') {
      const receiver = resolveValue(context, frame, { node: record(callee['object']), seen }),
        method = keyOf(record(callee['property']));
      const collections = receiver.filter(
        (value) =>
          (value.kind === 'fresh' || value.kind === 'reference' || value.kind === 'unknown') &&
          ['array', 'map', 'set'].includes(value.shape ?? ''),
      );
      if (collections.length) {
        if (arrayMethods.includes(method) || collectionMethods.includes(method))
          mutateCollection(context, frame, { receiver: collections, method, args, node });
        const transformed = callbackMethods.includes(method)
          ? invoke(context, frame, {
              values: args[0] ?? [],
              args: collectionArguments(context, method, { collections, args }),
              node,
            })
          : [unknown];
        if (['get', 'at', 'pop', 'shift', 'find'].includes(method))
          result = access(context, collections, '*');
        if (['slice', 'toSorted', 'toReversed', 'filter', 'map', 'flatMap'].includes(method)) {
          const elements =
            method === 'map'
              ? transformed
              : method === 'flatMap'
                ? unique(
                    transformed.flatMap((item) =>
                      (item.kind === 'fresh' || item.kind === 'reference') && item.shape === 'array'
                        ? property(item, '*', context.project)
                        : [item],
                    ),
                  )
                : access(context, collections, '*');
          result = collectionResult(context, frame, { node, elements, seen });
        }
      }
      if (
        ['then', 'catch', 'finally'].includes(method) &&
        receiver.some(
          (value) =>
            (value.kind === 'reference' || value.kind === 'fresh') && value.shape === 'promise',
        )
      )
        for (const arg of args) invoke(context, frame, { values: arg, args: [[unknown]], node });
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
const visit = (
  context: Context,
  frame: Frame,
  {
    node,
    parent,
    key,
    conditional = false,
  }: Readonly<{ node: Node; parent: Node; key: string; conditional?: boolean }>,
): void => {
  const kind = text(node, 'type');
  if (functionNode(node)) return;
  if (kind === 'CallExpression' || kind === 'NewExpression')
    call(context, frame, { node, seen: new Set() });
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
        write(context, frame, {
          values: [{ kind: 'reference', id: binding.id, path: [], shape: binding.type }],
          node,
          bindingAssignment: true,
        });
    } else {
      const key = target['computed']
        ? literalKey(record(target['property']))
        : keyOf(record(target['property']));
      const receivers =
        target['type'] === 'MemberExpression'
          ? resolveValue(context, frame, { node: record(target['object']) })
          : resolveValue(context, frame, { node: target });
      write(context, frame, {
        values: receivers.map((value) =>
          value.kind === 'reference' ? { ...value, path: [...value.path, key] } : value,
        ),
        node,
      });
      if (kind === 'AssignmentExpression' && target['type'] === 'MemberExpression') {
        context.evaluation.revision += 1;
        const values = resolveValue(context, frame, { node: record(node['right']) });
        for (const owner of receivers)
          if (owner.kind === 'fresh') {
            const local = owner.id.startsWith(
              `${context.root}:${frame.allocation}:${frame.fn.id}:`,
            );
            const replace =
              local &&
              !conditional &&
              key !== '*' &&
              receivers.length === 1 &&
              node['operator'] === '=';
            owner.slots.set(
              key,
              replace ? values : unique([...(owner.slots.get(key) ?? []), ...values]),
            );
          }
      }
    }
  }
  const isKey =
    (key === 'property' && !parent['computed']) ||
    (key === 'key' && !parent['computed']) ||
    key === 'id' ||
    key === 'typeAnnotation';
  if ((kind === 'Identifier' && !isKey) || kind === 'MemberExpression') read(context, frame, node);
  const branching = conditional || branchingNodes.includes(kind);
  for (const child of children(node))
    if (child.key !== 'typeAnnotation')
      visit(context, frame, {
        node: child.node,
        parent: node,
        key: child.key,
        conditional: branching,
      });
};

/** @impure Track calls and their externally visible effects for a single root function. */
const executeFunction = (
  context: Context,
  fn: FunctionModel,
  {
    summary,
    args = [],
    caller,
  }: Readonly<{ summary: string; args?: readonly (readonly Value[])[]; caller?: Frame }>,
): readonly Value[] => {
  const env = new Map(caller?.env);
  for (const parameter of fn.params) {
    let value = args[parameter.index];
    if (value) for (const key of parameter.path) value = access(context, value, key);
    if (value) env.set(parameter.binding, value);
  }
  const frame: Frame = {
    fn,
    env,
    active: new Set([...(caller?.active ?? []), fn.id]),
    chain: [...(caller?.chain ?? []), `${fn.file}:${fn.name || '<callback>'}`],
    summary,
    allocation: context.evaluation.expansions,
    allocations: new Map([...(caller?.allocations ?? []), [fn.id, context.evaluation.expansions]]),
  };
  context.evaluation.executed.add(fn.id);
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
    visit(context, frame, { node: initial, parent: parameter, key: 'right' });
    for (const parameterBinding of fn.params.filter((item) => item.index === index)) {
      let values = resolveValue(context, frame, { node: initial });
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
  visit(context, frame, { node: fn.body, parent: {}, key: '' });
  const returned: Value[] = [];
  /** @impure Append return origins to the current private analysis buffer. */
  const collect = (node: Node): void => {
    if (functionNode(node)) return;
    if (node['type'] === 'ReturnStatement')
      returned.push(...resolveValue(context, frame, { node: record(node['argument']) }));
    for (const child of children(node)) collect(child.node);
  };
  if (fn.body['type'] === 'BlockStatement') collect(fn.body);
  else returned.push(...resolveValue(context, frame, { node: fn.body }));
  if (context.project.declared.has(fn.id) && caller)
    effect(context, frame, { message: `declared effect: ${fn.reason}`, node: fn.node });
  const shape = typeKind(record(fn.node['returnType']));
  return unique(
    (returned.length ? returned : [unknown]).map((value) =>
      shape && value.kind === 'unknown' ? { ...value, shape } : value,
    ),
  );
};

/** @impure Reuse contextual summaries and schedule recursive return dependencies until stable. */
export const evaluateFunction = (
  context: Context,
  id: string,
  { args = [], caller }: Readonly<{ args?: readonly (readonly Value[])[]; caller?: Frame }> = {},
): readonly Value[] => {
  const fn = context.project.functions.get(id);
  if (!fn) return [unknown];
  const description = summaryContext(context.project, fn, {
    args,
    ...(caller ? { caller: caller } : {}),
  });
  let key = description.key;
  const { borrowed, recursion } = description;
  const evaluation = context.evaluation;
  const recursive = evaluation.stack.find((entry) => {
    const previous = evaluation.summaries.get(entry);
    return previous?.id === id && previous.recursion === recursion;
  });
  if (recursive) key = recursive;
  let summary = evaluation.summaries.get(key);
  if (!summary) {
    summary = {
      id,
      args,
      ...(caller ? { caller } : {}),
      values: [],
      active: false,
      ready: false,
      reusable: false,
      recursive: false,
      invalidated: false,
      dependents: new Set(),
      recursion,
      revision: 0,
    };
    evaluation.summaries.set(key, summary);
  }
  if (caller) summary.dependents.add(caller.summary);
  if (summary.active) {
    for (const active of evaluation.stack.slice(evaluation.stack.indexOf(key))) {
      const member = evaluation.summaries.get(active);
      if (member) member.recursive = true;
    }
    return summary.values;
  }
  // Recursive factories with changing private allocations remain outside the bounded model.
  if (borrowed && caller?.active.has(id)) return [unknown];
  if (
    summary.ready &&
    summary.reusable &&
    !summary.invalidated &&
    summary.revision === evaluation.revision
  ) {
    evaluation.cacheHits += 1;
    return summary.values;
  }
  if (evaluation.expansions >= context.maximumExpansions) {
    evaluation.incomplete = true;
    return [unknown];
  }
  summary.active = true;
  const propagating = summary.invalidated;
  summary.invalidated = false;
  evaluation.stack.push(key);
  evaluation.expansions += 1;
  const revision = evaluation.revision;
  const returned = executeFunction(context, fn, {
    summary: key,
    args,
    ...(caller ? { caller: caller } : {}),
  });
  const reusable = reusableReturn(returned, context.project);
  const values = summary.recursive
    ? reusable && returned.every((value) => value.kind !== 'fresh')
      ? unique([...summary.values, ...returned])
      : [unknown]
    : returned;
  summary.active = false;
  evaluation.stack.pop();
  summary.ready = true;
  summary.reusable = !borrowed && reusable && evaluation.revision === revision;
  summary.revision = evaluation.revision;
  if ((summary.recursive || propagating) && !sameValues(summary.values, values))
    for (const dependent of summary.dependents) {
      const target = evaluation.summaries.get(dependent);
      if (target && !target.active) {
        target.invalidated = true;
        evaluation.pending.add(dependent);
      }
    }
  summary.values = values;
  return values;
};

export const evaluatePurity = (
  project: Project,
  fn: FunctionModel,
  {
    changed,
    maximumExpansions = 512,
  }: Readonly<{ changed: ReadonlySet<string>; maximumExpansions?: number }>,
): Evaluation => {
  const evaluation: Evaluation = {
    effects: new Map(),
    writes: new Set(),
    executed: new Set(),
    fresh: new Map(),
    calls: new Map(),
    activeCalls: new Map(),
    summaries: new Map(),
    pending: new Set(),
    stack: [],
    expansions: 0,
    cacheHits: 0,
    revision: 0,
    reads: new Set(),
    incomplete: false,
  };
  const context = { project, evaluation, root: fn.id, changed, maximumExpansions };
  evaluateFunction(context, fn.id);
  for (const key of evaluation.pending) {
    evaluation.pending.delete(key);
    const summary = evaluation.summaries.get(key);
    if (!summary) continue;
    summary.ready = false;
    evaluateFunction(context, summary.id, {
      args: summary.args,
      ...(summary.caller ? { caller: summary.caller } : {}),
    });
  }
  // Retain report facts and counters, not temporary abstract heaps and call frames.
  evaluation.fresh.clear();
  evaluation.calls.clear();
  evaluation.activeCalls.clear();
  evaluation.summaries.clear();
  evaluation.pending.clear();
  return evaluation;
};
