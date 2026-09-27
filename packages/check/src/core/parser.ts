import { parseSync } from 'oxc-parser';
import { capture } from '@ts-calm/fp/boundary';
import { get, getError, isErr, isNull, isPlainObject } from '@ts-calm/fp';
import type {
  Fact,
  FunctionFact,
  ImportFact,
  ParsedSource,
  SignatureFact,
  SourceFile,
} from '#src/core/types';

export type Node = Readonly<Record<string, unknown>>;
export type Child = Readonly<{ key: string; node: Node }>;
type Environment = ReadonlyMap<string, string>;
const absent: Node = Object.freeze({});
export const record = (value: unknown): Node => (isPlainObject(value) ? value : absent);
export const text = (node: Node, key: string): string =>
  typeof node[key] === 'string' ? node[key] : '';
export const offset = (node: Node, key = 'start'): number =>
  typeof node[key] === 'number' ? node[key] : 0;
export const functionNode = (node: Node): boolean =>
  ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
    text(node, 'type'),
  );
const childCache = new WeakMap<Node, readonly Child[]>();
export const children = (node: Node): readonly Child[] => {
  const cached = childCache.get(node);
  if (cached) return cached;
  const result: Child[] = [];
  for (const key of Object.keys(node)) {
    const value: unknown = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const child = record(item);
        if (typeof child['type'] === 'string') result.push({ key, node: child });
      }
      continue;
    }
    const child = record(value);
    if (typeof child['type'] === 'string') result.push({ key, node: child });
  }
  childCache.set(node, result);
  return result;
};

const bindingNames = (node: Node): readonly string[] => {
  if (node['type'] === 'Identifier') return [text(node, 'name')];
  if (node['type'] === 'AssignmentPattern') return bindingNames(record(node['left']));
  if (node['type'] === 'Property') return bindingNames(record(node['value']));
  if (node['type'] === 'RestElement') return bindingNames(record(node['argument']));
  return children(node).flatMap((child) => bindingNames(child.node));
};

const expressionName = (node: Node, env: Environment): string => {
  if (node['type'] === 'Identifier') return env.get(text(node, 'name')) ?? text(node, 'name');
  if (node['type'] === 'MemberExpression') {
    const owner = expressionName(record(node['object']), env);
    const property = record(node['property']);
    const key = node['computed'] ? text(property, 'value') : text(property, 'name');
    return owner && key ? `${owner}.${key}` : '';
  }
  return '';
};

/** @impure Update the supplied lexical binding environment. */
const bindPattern = (pattern: Node, origin: string, env: Map<string, string>): void => {
  if (pattern['type'] === 'Identifier') {
    env.set(text(pattern, 'name'), origin);
    return;
  }
  if (pattern['type'] === 'ObjectPattern' && Array.isArray(pattern['properties']))
    for (const entry of pattern['properties']) {
      const property = record(entry);
      const key = record(property['key']);
      const name = text(key, 'name') || text(key, 'value');
      bindPattern(record(property['value']), origin && name ? `${origin}.${name}` : '', env);
    }
};

const literalText = (node: Node): string => {
  if (node['type'] === 'Literal') return text(node, 'value');
  if (
    node['type'] === 'TemplateLiteral' &&
    Array.isArray(node['expressions']) &&
    node['expressions'].length === 0 &&
    Array.isArray(node['quasis'])
  )
    return text(record(record(node['quasis'][0])['value']), 'cooked');
  return '';
};

const effectModules = [
  'fs',
  'fs/promises',
  'net',
  'http',
  'https',
  'http2',
  'dns',
  'dns/promises',
  'tls',
  'dgram',
  'child_process',
  'worker_threads',
  'process',
  'console',
  'readline',
  'readline/promises',
  'timers',
  'timers/promises',
  'os',
  'module',
  'v8',
  'inspector',
  'inspector/promises',
];
const globalEffects = [
  'fetch',
  'WebSocket',
  'EventSource',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
  'Date.now',
  'Math.random',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues',
];

export const effectName = (name: string, custom: readonly string[]): string => {
  const normalized = name.replace(/^globalThis\./, '').replaceAll(':.', ':');
  for (const module of effectModules)
    if (normalized.startsWith(`${module}:`) || normalized.startsWith(`node:${module}:`))
      return `node:${module}`;
  for (const module of custom) if (normalized.startsWith(`${module}:`)) return module;
  if (
    /^(?:node:)?crypto:(?:randomUUID|randomBytes|randomFill|randomFillSync|randomInt|getRandomValues)(?:\.|$)/.test(
      normalized,
    )
  )
    return `crypto.${normalized.split(':').at(-1)?.split('.')[0] ?? ''}`;
  if (/^(?:node:)?perf_hooks:performance\.now$/.test(normalized)) return 'performance.now';
  if (normalized === 'process' || normalized.startsWith('process.')) return 'process';
  if (normalized === 'console' || normalized.startsWith('console.')) return 'console';
  return globalEffects.includes(normalized) ? normalized : '';
};

const forbidden: Readonly<Record<string, string>> = {
  ThrowStatement: 'no-throw',
  TryStatement: 'no-try',
  TSTypeAssertion: 'no-assertion',
  TSAnyKeyword: 'no-any',
  TSNonNullExpression: 'no-non-null',
  TSNullKeyword: 'no-null',
  TSUndefinedKeyword: 'no-undefined',
  ClassDeclaration: 'no-class',
  ClassExpression: 'no-class',
  ThisExpression: 'no-this',
  WithStatement: 'no-with',
};

const strictFact = (
  node: Node,
  parent: Node,
  { key, depth, env }: Readonly<{ key: string; depth: number; env: Environment }>,
): string => {
  const kind = text(node, 'type');
  if (forbidden[kind]) return forbidden[kind];
  if (
    kind === 'TSAsExpression' &&
    text(record(record(node['typeAnnotation'])['typeName']), 'name') !== 'const'
  )
    return 'no-assertion';
  if (kind === 'Literal' && isNull(node['value'])) return 'no-null';
  const field =
    (key === 'property' && !parent['computed']) ||
    (key === 'key' && !parent['computed']) ||
    key === 'id' ||
    parent['type'] === 'ImportSpecifier';
  if (kind === 'Identifier' && node['name'] === 'undefined' && !field && !env.has('undefined'))
    return 'no-undefined';
  if (kind === 'UnaryExpression' && node['operator'] === 'delete') return 'no-delete';
  if (kind === 'VariableDeclaration' && node['kind'] === 'var') return 'no-var';
  if (kind === 'VariableDeclaration' && node['kind'] === 'let' && depth === 0)
    return 'no-module-state';
  return '';
};

const importFact = (node: Node): ImportFact | false => {
  const kind = text(node, 'type');
  if (
    ![
      'ImportDeclaration',
      'ExportNamedDeclaration',
      'ExportAllDeclaration',
      'ImportExpression',
      'TSImportType',
    ].includes(kind)
  )
    return false;
  const source = record(node['source'] ?? node['argument']);
  const literal = source['type'] === 'TSLiteralType' ? record(source['literal']) : source;
  const specifier = literalText(literal);
  if (!specifier) return false;
  const bindings = Array.isArray(node['specifiers']) ? node['specifiers'].map(record) : [];
  return {
    specifier,
    offset: offset(node),
    typeOnly:
      kind === 'TSImportType' ||
      node['importKind'] === 'type' ||
      node['exportKind'] === 'type' ||
      (bindings.length > 0 &&
        bindings.every(
          (binding) => binding['importKind'] === 'type' || binding['exportKind'] === 'type',
        )),
  };
};

const scoped = (node: Node, inherited: Environment): Map<string, string> => {
  const env = new Map(inherited);
  if (functionNode(node)) {
    const params = Array.isArray(node['params']) ? node['params'] : [];
    for (const param of params) for (const name of bindingNames(record(param))) env.set(name, '');
  }
  const body = Array.isArray(node['body']) ? node['body'].map(record) : [];
  for (const statement of body) {
    const declaration = record(statement['declaration'] ?? statement);
    if (declaration['type'] === 'ImportDeclaration') {
      bindImport(declaration, env);
      continue;
    }
    if (Array.isArray(declaration['declarations']))
      for (const entry of declaration['declarations'])
        for (const name of bindingNames(record(record(entry)['id']))) env.set(name, '');
    for (const name of bindingNames(record(declaration['id']))) env.set(name, '');
  }
  if (node['type'] === 'CatchClause')
    for (const name of bindingNames(record(node['param']))) env.set(name, '');
  return env;
};

/** @impure Register imported names in the supplied environment. */
const bindImport = (node: Node, env: Map<string, string>): void => {
  const module = text(record(node['source']), 'value');
  const bindings = Array.isArray(node['specifiers']) ? node['specifiers'] : [];
  for (const value of bindings) {
    const binding = record(value);
    const imported = record(binding['imported']);
    const member = text(imported, 'name') || text(imported, 'value');
    env.set(text(record(binding['local']), 'name'), `${module}:${member}`);
  }
};

const collect = (source: SourceFile, custom: readonly string[]): ParsedSource => {
  const result = parseSync(source.path, source.content);
  const strict: Fact[] = [],
    effects: Fact[] = [],
    issues: Fact[] = [];
  const functions: FunctionFact[] = [],
    imports: ImportFact[] = [];
  const signatures: SignatureFact[] = [];
  for (const error of result.errors)
    issues.push({ name: error.message, offset: error.labels[0]?.start ?? 0 });
  let hasImplementation = false;
  /** @impure Append parser facts to the captured result and update lexical environments. */
  const walk = (
    node: Node,
    parent: Node,
    {
      key,
      depth,
      inherited,
    }: Readonly<{ key: string; depth: number; inherited: Map<string, string> }>,
  ): void => {
    const kind = text(node, 'type');
    const env =
      ['Program', 'BlockStatement', 'CatchClause'].includes(kind) || functionNode(node)
        ? scoped(node, inherited)
        : inherited;
    if (kind === 'ImportDeclaration') bindImport(node, env);
    if (kind === 'VariableDeclarator')
      bindPattern(record(node['id']), expressionName(record(node['init']), env), env);
    const restriction = strictFact(node, parent, { key, depth, env });
    if (restriction) strict.push({ name: restriction, offset: offset(node) });
    if (kind === 'VariableDeclaration' && node['kind'] === 'var' && depth === 0)
      strict.push({ name: 'no-module-state', offset: offset(node) });
    const imported = importFact(node);
    if (imported) imports.push(imported);
    if (
      imported &&
      !imported.typeOnly &&
      Array.isArray(node['specifiers']) &&
      node['specifiers'].some(
        (item) => record(item)['importKind'] === 'type' || record(item)['exportKind'] === 'type',
      )
    )
      imports.push({ ...imported, typeOnly: true });
    if (kind === 'ImportExpression' && !imported)
      issues.push({
        name: 'Computed import cannot be checked for file cycles; use literal imports.',
        offset: offset(node),
      });
    if (
      kind === 'TSImportEqualsDeclaration' ||
      (kind === 'CallExpression' && expressionName(record(node['callee']), env) === 'require')
    )
      issues.push({
        name: 'CommonJS imports are not supported by the ESM source graph; use import syntax.',
        offset: offset(node),
      });
    if (functionNode(node)) {
      const body = record(node['body']);
      if (Object.keys(body).length > 0) {
        hasImplementation = true;
        functions.push({
          name:
            text(record(node['id']), 'name') || text(record(parent['id']), 'name') || '<anonymous>',
          start: offset(node),
          bodyStart: offset(body),
          bodyEnd: offset(body, 'end'),
          bodyBlock: text(body, 'type') === 'BlockStatement',
        });
      }
    }
    if (
      (functionNode(node) ||
        [
          'TSDeclareFunction',
          'TSFunctionType',
          'TSConstructorType',
          'TSMethodSignature',
          'TSCallSignatureDeclaration',
          'TSConstructSignatureDeclaration',
          'TSEmptyBodyFunctionExpression',
        ].includes(kind)) &&
      Array.isArray(node['params'])
    ) {
      signatures.push({
        offset: ['MethodDefinition', 'TSAbstractMethodDefinition'].includes(text(parent, 'type'))
          ? offset(parent)
          : offset(node),
        parameters: node['params'].filter((parameter) => {
          const value = record(parameter);
          return value['type'] !== 'Identifier' || value['name'] !== 'this';
        }).length,
      });
    }
    if (['CallExpression', 'NewExpression', 'MemberExpression'].includes(kind)) {
      const expression = kind === 'MemberExpression' ? node : record(node['callee']);
      const name = expressionName(expression, env);
      let effect = effectName(name, custom);
      if (
        (name === 'Date' || name === 'globalThis.Date') &&
        (kind === 'CallExpression' ||
          (kind === 'NewExpression' &&
            Array.isArray(node['arguments']) &&
            node['arguments'].length === 0))
      )
        effect = 'Date';
      if (effect) effects.push({ name: effect, offset: offset(node) });
      if (kind !== 'MemberExpression') hasImplementation = true;
    }
    if (
      kind === 'ImportDeclaration' &&
      Array.isArray(node['specifiers']) &&
      node['specifiers'].length === 0
    ) {
      const name = text(record(node['source']), 'value');
      effects.push({ name, offset: offset(node) });
      hasImplementation = true;
    }
    for (const child of children(node))
      walk(child.node, node, {
        key: child.key,
        depth: depth + (functionNode(node) ? 1 : 0),
        inherited: env,
      });
  };
  walk(record(result.program), {}, { key: '', depth: 0, inherited: new Map() });
  return {
    ast: result.program,
    comments: result.comments.map((comment) => ({
      text: comment.value,
      start: comment.start,
      end: comment.end,
    })),
    functions,
    signatures,
    imports,
    strict,
    effects,
    issues,
    hasImplementation,
  };
};

export const parseSource = (
  source: SourceFile,
  effectImports: readonly string[] = [],
): ParsedSource => {
  const captured = capture(() => collect(source, effectImports), { name: 'parse-source' });
  if (isErr(captured)) {
    const cause = getError(captured).cause;
    return {
      comments: [],
      functions: [],
      signatures: [],
      imports: [],
      strict: [],
      effects: [],
      hasImplementation: false,
      issues: [{ name: cause instanceof Error ? cause.message : 'Parser failed.', offset: 0 }],
    };
  }
  return get(captured);
};
