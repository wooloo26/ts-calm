import { record, text, offset, children, functionNode } from '#src/core/parser';
import type { Node } from '#src/core/parser';
import type { AnalyzedFile } from '#src/core/types';

export type Binding = {
  id: string;
  name: string;
  owner: string;
  mutable: boolean;
  parameter: boolean;
  type: string;
  annotation: Node;
  values: Node[];
  projection: string[];
  specifier: string;
  imported: string;
};
export type FunctionModel = {
  id: string;
  file: string;
  name: string;
  parent: string;
  start: number;
  end: number;
  anchor: number;
  node: Node;
  body: Node;
  params: { binding: string; index: number; path: string[] }[];
  inline: boolean;
  annotated: boolean;
  reason: string;
  annotationOffsets: number[];
  captures: string[];
};
export type ExportTarget = Readonly<{ binding?: string; specifier?: string; name?: string }>;
export type PurityModel = {
  file: AnalyzedFile;
  module: string;
  bindings: Map<string, Binding>;
  refs: Map<number, string>;
  nodeOwners: Map<number, string>;
  functions: Map<string, FunctionModel>;
  functionNodes: Map<number, string>;
  exports: Map<string, ExportTarget>;
  stars: { specifier: string }[];
  typeDefs: Map<string, Node>;
  importsByName: Map<string, Binding>;
};
type Scope = { owner: string; parent?: Scope; names: Map<string, string> };

const typeKind = (node: Node): string => {
  const annotation = record(node['typeAnnotation'] ?? node);
  if (annotation['type'] === 'TSTypeAnnotation' || annotation['type'] === 'TSTypeOperator')
    return typeKind(record(annotation['typeAnnotation']));
  if (['TSArrayType', 'TSTupleType'].includes(text(annotation, 'type'))) return 'array';
  if (['TSTypeLiteral', 'TSInterfaceBody'].includes(text(annotation, 'type'))) return 'object';
  const name = text(record(annotation['typeName']), 'name');
  if (['Array', 'ReadonlyArray', 'NonEmptyReadonlyArray'].includes(name)) return 'array';
  if (['Map', 'ReadonlyMap'].includes(name)) return 'map';
  if (['Set', 'ReadonlySet'].includes(name)) return 'set';
  if (['Promise', 'PromiseLike', 'AsyncResult'].includes(name)) return 'promise';
  if (annotation['type'] === 'TSUnionType')
    return (
      children(annotation)
        .map(({ node }) => typeKind(node))
        .find(Boolean) ?? ''
    );
  return '';
};

const find = (scope: Scope, name: string): string =>
  scope.names.get(name) ?? (scope.parent ? find(scope.parent, name) : '');
const members = (value: unknown): Node[] => (Array.isArray(value) ? value.map(record) : []);

/** @impure Populate the supplied lexical model and scope. */
const declare = (
  model: PurityModel,
  scope: Scope,
  {
    pattern,
    value,
    mutable,
    parameter = false,
    projection = [],
  }: Readonly<{
    pattern: Node;
    value: Node;
    mutable: boolean;
    parameter?: boolean;
    projection?: string[];
  }>,
): string[] => {
  if (pattern['type'] === 'Identifier') {
    const name = text(pattern, 'name'),
      id = scope.names.get(name) ?? `${scope.owner}:${name}:${offset(pattern)}`;
    const previous = model.bindings.get(id);
    if (previous) {
      if (Object.keys(value).length) previous.values.push(value);
    } else
      model.bindings.set(id, {
        id,
        name,
        owner: scope.owner,
        mutable,
        parameter,
        type: typeKind(pattern),
        annotation: record(pattern['typeAnnotation']),
        values: Object.keys(value).length ? [value] : [],
        projection,
        specifier: '',
        imported: '',
      });
    scope.names.set(name, id);
    model.refs.set(offset(pattern), id);
    return [id];
  }
  if (pattern['type'] === 'AssignmentPattern')
    return declare(model, scope, {
      pattern: record(pattern['left']),
      value,
      mutable,
      parameter,
      projection,
    });
  if (pattern['type'] === 'RestElement')
    return declare(model, scope, {
      pattern: record(pattern['argument']),
      value,
      mutable,
      parameter,
      projection: [...projection, '*'],
    });
  const result: string[] = [];
  if (pattern['type'] === 'ObjectPattern')
    for (const property of members(pattern['properties'])) {
      const key = record(property['key']);
      result.push(
        ...declare(model, scope, {
          pattern: record(property['value'] ?? property['argument']),
          value,
          mutable,
          parameter,
          projection: [...projection, text(key, 'name') || text(key, 'value') || '*'],
        }),
      );
    }
  if (pattern['type'] === 'ArrayPattern')
    members(pattern['elements']).forEach((item, index) =>
      result.push(
        ...declare(model, scope, {
          pattern: item,
          value,
          mutable,
          parameter,
          projection: [...projection, String(index)],
        }),
      ),
    );
  return result;
};

/** @impure Register declarations in the supplied lexical model. */
const predeclare = (model: PurityModel, scope: Scope, statements: readonly Node[]): void => {
  for (const statement of statements) {
    const node = record(statement['declaration'] ?? statement);
    if (node['type'] === 'VariableDeclaration')
      for (const entry of members(node['declarations']))
        declare(model, scope, {
          pattern: record(entry['id']),
          value: record(entry['init']),
          mutable: node['kind'] !== 'const',
        });
    if (node['type'] === 'FunctionDeclaration')
      declare(model, scope, { pattern: record(node['id']), value: node, mutable: false });
    if (node['type'] === 'ImportDeclaration')
      for (const entry of members(node['specifiers'])) {
        const ids = declare(model, scope, {
          pattern: record(entry['local']),
          value: {},
          mutable: false,
        });
        const binding = model.bindings.get(ids[0] ?? '');
        if (binding) {
          binding.specifier = text(record(node['source']), 'value');
          binding.imported =
            entry['type'] === 'ImportDefaultSpecifier'
              ? 'default'
              : entry['type'] === 'ImportNamespaceSpecifier'
                ? '*'
                : text(record(entry['imported']), 'name') ||
                  text(record(entry['imported']), 'value');
        }
      }
  }
};

const annotation = (file: AnalyzedFile, anchor: number) => {
  const comment = [...file.parsed.comments]
    .reverse()
    .find((entry) => entry.end <= anchor && !file.source.content.slice(entry.end, anchor).trim());
  const normalized = (
    comment && file.source.content.slice(comment.start, comment.start + 3) === '/**'
      ? comment.text
      : ''
  )
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join('\n');
  const tags = [...normalized.matchAll(/@impure\b([^@]*)/g)];
  return {
    annotated: tags.length > 0,
    reason: (tags[0]?.[1] ?? '').trim(),
    annotationOffsets: tags.map(() => comment?.start ?? anchor),
  };
};

/** @impure Bind loop elements to their iterable's abstract element origin. */
const declareIteration = (model: PurityModel, node: Node, scope: Scope): void => {
  const left = record(node['left']);
  if (left['type'] !== 'VariableDeclaration') return;
  for (const entry of members(left['declarations']))
    declare(model, scope, {
      pattern: record(entry['id']),
      value: {
        type: 'MemberExpression',
        object: node['right'],
        computed: true,
        property: { type: 'Literal', value: '*' },
        start: offset(node),
        end: offset(node, 'end'),
      },
      mutable: false,
    });
};

/** @impure Register type definitions for later collection and property shape resolution. */
const registerType = (model: PurityModel, node: Node): void => {
  if (node['type'] === 'TSTypeAliasDeclaration')
    model.typeDefs.set(text(record(node['id']), 'name'), record(node['typeAnnotation']));
  if (node['type'] === 'TSInterfaceDeclaration')
    model.typeDefs.set(text(record(node['id']), 'name'), record(node['body']));
};

/** @impure Populate this invocation's lexical model maps and builder records. */
const walkModel = (
  model: PurityModel,
  node: Node,
  { scope, parent, anchor }: Readonly<{ scope: Scope; parent: Node; anchor: number }>,
): void => {
  const kind = text(node, 'type');
  model.nodeOwners.set(offset(node), scope.owner);
  registerType(model, node);
  if (functionNode(node) && Object.keys(record(node['body'])).length) {
    const id = `${model.file.source.path}:${offset(node)}`;
    const name =
      text(record(node['id']), 'name') ||
      text(record(parent['id']), 'name') ||
      text(record(parent['key']), 'name');
    const fn: FunctionModel = {
      id,
      file: model.file.source.path,
      name,
      parent: scope.owner,
      start: offset(node),
      end: offset(node, 'end'),
      anchor,
      node,
      body: record(node['body']),
      params: [],
      inline:
        parent['type'] === 'CallExpression' ||
        parent['type'] === 'NewExpression' ||
        parent['type'] === 'AssignmentPattern',
      captures: [],
      ...annotation(model.file, anchor),
    };
    model.functions.set(id, fn);
    model.functionNodes.set(offset(node), id);
    const child: Scope = { owner: id, parent: scope, names: new Map() };
    members(node['params']).forEach((param, index) => {
      const ids = declare(model, child, {
        pattern: param,
        value: {},
        mutable: false,
        parameter: true,
      });
      for (const binding of ids)
        fn.params.push({ binding, index, path: model.bindings.get(binding)?.projection ?? [] });
    });
    for (const param of members(node['params']))
      walkModel(model, param, { scope: child, parent: node, anchor: offset(param) });
    walkModel(model, fn.body, { scope: child, parent: node, anchor: offset(fn.body) });
    return;
  }
  let current = scope;
  if (['ForOfStatement', 'ForInStatement', 'ForStatement'].includes(kind))
    current = { owner: scope.owner, parent: scope, names: new Map() };
  if (kind === 'Program' || kind === 'BlockStatement') {
    current = kind === 'Program' ? scope : { owner: scope.owner, parent: scope, names: new Map() };
    predeclare(model, current, members(node['body']));
  }
  if (kind === 'VariableDeclaration')
    for (const entry of members(node['declarations']))
      if (!model.refs.has(offset(record(entry['id']))))
        declare(model, current, {
          pattern: record(entry['id']),
          value: record(entry['init']),
          mutable: node['kind'] !== 'const',
        });
  if (kind === 'ForOfStatement') declareIteration(model, node, current);
  if (kind === 'CatchClause') {
    current = { owner: scope.owner, parent: scope, names: new Map() };
    declare(model, current, {
      pattern: record(node['param']),
      value: {},
      mutable: false,
      parameter: true,
    });
  }
  if (kind === 'Identifier') {
    const id = find(current, text(node, 'name'));
    if (id) model.refs.set(offset(node), id);
  }
  if (kind === 'AssignmentExpression' && record(node['left'])['type'] === 'Identifier') {
    const binding = model.bindings.get(find(current, text(record(node['left']), 'name')));
    if (binding && binding.owner === current.owner) binding.values.push(record(node['right']));
  }
  for (const child of children(node)) {
    const next = [
      'ExportNamedDeclaration',
      'ExportDefaultDeclaration',
      'VariableDeclaration',
      'VariableDeclarator',
      'Property',
    ].includes(kind)
      ? anchor
      : offset(child.node);
    walkModel(model, child.node, { scope: current, parent: node, anchor: next });
  }
};

export const buildPurityModel = (file: AnalyzedFile): PurityModel => {
  const model: PurityModel = {
    file,
    module: `${file.source.path}:module`,
    bindings: new Map(),
    refs: new Map(),
    nodeOwners: new Map(),
    functions: new Map(),
    functionNodes: new Map(),
    exports: new Map(),
    stars: [],
    typeDefs: new Map(),
    importsByName: new Map(),
  };
  const scope: Scope = { owner: model.module, names: new Map() };
  const program = record(file.parsed.ast);
  walkModel(model, program, { scope, parent: {}, anchor: 0 });
  for (const fn of model.functions.values())
    fn.captures = [
      ...new Set(
        [...model.refs]
          .filter(
            ([position, id]) =>
              position >= fn.start && position < fn.end && model.bindings.get(id)?.owner !== fn.id,
          )
          .map(([, id]) => id),
      ),
    ];
  for (const binding of model.bindings.values())
    if (binding.specifier && !model.importsByName.has(binding.name))
      model.importsByName.set(binding.name, binding);
  for (const binding of model.bindings.values())
    if (!binding.type)
      for (const value of binding.values) {
        if (value['type'] === 'ArrayExpression') binding.type = 'array';
        if (value['type'] === 'ObjectExpression') binding.type = 'object';
        const callee = record(value['callee']);
        if (
          value['type'] === 'NewExpression' &&
          !model.refs.has(offset(callee)) &&
          ['Map', 'Set', 'Array'].includes(text(callee, 'name'))
        )
          binding.type = text(callee, 'name').toLowerCase();
        if (value['type'] === 'Identifier')
          binding.type = model.bindings.get(model.refs.get(offset(value)) ?? '')?.type ?? '';
      }
  for (const node of members(program['body'])) {
    const declaration = record(node['declaration']);
    if (node['type'] === 'ExportAllDeclaration')
      model.stars.push({ specifier: text(record(node['source']), 'value') });
    if (node['type'] === 'ExportDefaultDeclaration') {
      const id = model.functionNodes.get(offset(declaration));
      if (id) model.exports.set('default', { binding: id });
      else {
        const name = text(declaration, 'name');
        if (name) model.exports.set('default', { binding: find(scope, name) });
      }
    }
    if (node['type'] !== 'ExportNamedDeclaration') continue;
    const names =
      declaration['type'] === 'VariableDeclaration'
        ? members(declaration['declarations']).map((entry) => text(record(entry['id']), 'name'))
        : [text(record(declaration['id']), 'name')];
    for (const name of names.filter(Boolean))
      model.exports.set(name, { binding: find(scope, name) });
    for (const item of members(node['specifiers'])) {
      const name =
        text(record(item['exported']), 'name') || text(record(item['exported']), 'value');
      const local = text(record(item['local']), 'name');
      const specifier = text(record(node['source']), 'value');
      model.exports.set(
        name,
        specifier ? { specifier, name: local } : { binding: find(scope, local) },
      );
    }
  }
  return model;
};

export { typeKind };
