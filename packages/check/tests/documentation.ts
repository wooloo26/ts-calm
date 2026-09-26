import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';
import { isArray, isPlainObject } from '@ts-calm/fp';
import { renderRuleGuide } from '#src/rule-help';

const packages = ['@ts-calm/fp', '@ts-calm/check'] as const;
const load = createRequire(import.meta.url);

type Node = Readonly<Record<string, unknown>>;

const node = (value: unknown): Node => (isPlainObject(value) ? value : {});
const name = (value: unknown): string => {
  const identifier = node(value);
  return typeof identifier['name'] === 'string' ? identifier['name'] : '';
};
const offset = (value: unknown): number => {
  const value0 = node(value)['start'];
  return typeof value0 === 'number' ? value0 : 0;
};

const documentationBefore = (source: string, position: number): string => {
  const blocks: string[] = [];
  let cursor = position;
  for (let step = 0; step < 4; step += 1) {
    const trimmed = source.slice(0, cursor).trimEnd();
    if (!trimmed.endsWith('*/')) break;
    const opened = trimmed.lastIndexOf('/**');
    if (opened < 0) break;
    blocks.unshift(trimmed.slice(opened));
    const between = trimmed.slice(trimmed.lastIndexOf('*/', opened - 1) + 2, opened);
    if (between.trim() !== '') break;
    cursor = opened;
  }
  return blocks.join('\n');
};

const summaryOf = (comment: string): string =>
  comment
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('@'))
    .join(' ');

const declaredParameterNames = (signature: string): readonly string[] => {
  const names: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of signature) {
    if ('<([{'.includes(character)) depth += 1;
    else if ('>)]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      names.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  names.push(current);
  return names
    .map((parameter) => parameter.trim())
    .filter((parameter) => parameter.length > 0)
    .map((parameter) => /^\.{3}\s*([A-Za-z_$][\w$]*)/.exec(parameter)?.[1] ?? '')
    .filter((parameter) => parameter.length > 0)
    .filter((parameter) => !parameter.startsWith('_'))
    .filter((parameter) => !['readonly', 'public', 'private', 'protected'].includes(parameter));
};

const parameterNames = (text: string): readonly string[] => {
  const signatures: string[] = [];
  for (const match of text.matchAll(/\(/g)) {
    const from = match.index ?? 0;
    let depth = 0;
    for (let index = from; index < text.length; index += 1) {
      const character = text.charAt(index);
      if (character === '(') depth += 1;
      else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          signatures.push(text.slice(from + 1, index));
          break;
        }
      }
    }
  }
  const first = signatures[0];
  if (!first) return [];
  if (/^function\b/.test(text.trim()) || text.includes('=')) return declaredParameterNames(first);
  const annotated = /(?:^|[:=]\s*[^=]*?)\(([^)]*)\)\s*=>/.exec(text)?.[1];
  return declaredParameterNames(annotated ?? first);
};

const targetFile = (from: string, specifier: string, directory: string): string => {
  const candidates: string[] = [];
  const packageFile = resolve(directory, 'package.json');
  const imports = node(node(JSON.parse(readFileSync(packageFile, 'utf8')))['imports']);
  for (const [pattern, value] of Object.entries(imports)) {
    if (!pattern.includes('*') || !specifier.startsWith(pattern.replace('*', ''))) continue;
    const rest = specifier.slice(pattern.replace('*', '').length);
    const mapped = node(value)['default'];
    if (typeof mapped === 'string') candidates.push(resolve(directory, mapped.replace('*', rest)));
  }
  if (specifier.startsWith('.')) candidates.push(resolve(dirname(from), specifier));
  for (const candidate of candidates)
    for (const declaration of [
      candidate.replace(/\.js$/, '.d.ts'),
      candidate.replace(/\.js$/, '.d.mts'),
      `${candidate}.d.ts`,
      `${candidate}/index.d.ts`,
      candidate.replace(/\.ts$/, '.d.ts'),
      candidate,
    ])
      if (existsSync(declaration)) return declaration;
  return '';
};

type Problem = (name: string, reason: string) => void;

const walk = (
  file: string,
  directory: string,
  seen: ReadonlySet<string>,
  report: Problem,
  required?: readonly string[],
): void => {
  if (seen.has(file)) return;
  const visited = new Set([...seen, file]);
  const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const body = parseSync(file, source).program.body;
  const declared = new Map<string, { positions: number[]; text: string }>();
  const addDeclaration = (
    declaredName: string,
    positions: readonly number[],
    text: string,
  ): void => {
    const existing = declared.get(declaredName);
    if (existing) {
      for (const position of positions) existing.positions.push(position);
      if (existing.text === '') existing.text = text;
      return;
    }
    declared.set(declaredName, { positions: [...positions], text });
  };
  const followed: { local: string; exported: string; file: string }[] = [];
  const demanded = new Set(required ?? []);
  for (const raw of body) {
    const statement = node(raw);
    const kind = String(statement['type']);
    const inner = node(statement['declaration']);
    if (kind === 'ExportDefaultDeclaration') {
      addDeclaration('default', [offset(raw)], '');
      continue;
    }
    if (kind !== 'ExportNamedDeclaration' && kind !== 'ExportAllDeclaration') continue;
    const sourceNode = node(statement['source']);
    const target = targetFile(
      file,
      typeof sourceNode['value'] === 'string' ? sourceNode['value'] : '',
      directory,
    );
    const innerName = name(inner['id']);
    if (innerName) {
      addDeclaration(
        innerName,
        [offset(inner), offset(raw)],
        source.slice(offset(inner), offset(inner) + 400),
      );
      continue;
    }
    const specifiers = statement['specifiers'];
    if (isArray(specifiers) && specifiers.length > 0) {
      for (const entry of specifiers) {
        const item = node(entry);
        const exported = name(item['exported']);
        const local = name(item['local']);
        if (target && local) followed.push({ local, exported, file: target });
        else if (target) followed.push({ local: exported, exported, file: target });
        else if (local) addDeclaration(exported, [offset(entry)], '');
      }
      continue;
    }
    if (kind === 'ExportAllDeclaration' && target)
      walk(
        target,
        directory,
        visited,
        report,
        [...demanded].filter((item) => item.length > 0),
      );
  }
  for (const [exported, declaration] of declared) {
    if (!demanded.has(exported)) continue;
    const comment = declaration.positions
      .map((position) => documentationBefore(source, position))
      .find((candidate) => candidate.length > 0);
    if (!comment) {
      report(
        exported,
        `no JSDoc block for ${declaration.positions.join('/')} in ${file.replaceAll('\\', '/').split('/').slice(-2).join('/')}`,
      );
      continue;
    }
    if (summaryOf(comment).replace(/[^\p{L}\p{N}]+/gu, '').length < 12)
      report(exported, 'summary is not prose');
    for (const parameter of parameterNames(declaration.text))
      if (!comment.includes(`@param ${parameter}`)) report(exported, `missing @param ${parameter}`);
  }
  for (const entry of followed.filter((item) => demanded.has(item.exported)))
    walk(entry.file, directory, visited, report, [entry.local]);
};

const exportedNames = (file: string, source: string): readonly string[] => {
  const names: string[] = [];
  for (const raw of parseSync(file, source).program.body) {
    const statement = node(raw);
    const kind = String(statement['type']);
    if (kind === 'ExportDefaultDeclaration') names.push('default');
    if (kind !== 'ExportNamedDeclaration') continue;
    const inner = name(node(statement['declaration'])['id']);
    if (inner) names.push(inner);
    const specifiers = statement['specifiers'];
    if (!isArray(specifiers)) continue;
    for (const entry of specifiers) names.push(name(node(entry)['exported']));
  }
  return names.filter((entry) => entry.length > 0);
};

const namedExportNames = (file: string, source: string): readonly string[] =>
  exportedNames(file, source).filter((entry) => entry !== 'default');

describe('published API documentation', () => {
  it('keeps the generated rule guide in step with the rule help', () => {
    const guide = readFileSync(new URL('../../../docs/rules.md', import.meta.url), 'utf8');
    expect(guide).toBe(renderRuleGuide());
  });
  for (const packageName of packages)
    it(`documents every export of ${packageName}`, () => {
      const missing: string[] = [];
      const manifestPath = load.resolve(`${packageName}/package.json`);
      const directory = dirname(manifestPath);
      const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const subpaths = node(manifest)['exports'] ?? node(manifest);
      for (const [subpath, value] of Object.entries(subpaths)) {
        const types = node(value)['types'];
        if (typeof types !== 'string') continue;
        const file = resolve(directory, types);
        const label = `${packageName}${subpath === '.' ? '' : subpath.replace(/^\./, '')}`;
        const source = readFileSync(file, 'utf8');
        const names = namedExportNames(file, source);
        walk(
          file,
          directory,
          new Set(),
          (exported, reason) => missing.push(`${label} -> ${exported} (${reason})`),
          names,
        );
      }
      expect(missing).toEqual([]);
    });
});
