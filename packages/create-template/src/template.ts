/** The pinned toolchain and package versions written into a generated workspace. */
export type WorkspaceTemplateOptions = Readonly<{
  /** The `@ts-calm/fp` version pinned in the generated manifests. */
  fpVersion: string;
  /** The `@ts-calm/check` version pinned in the generated manifests. */
  checkVersion: string;
  /** The TypeScript compiler version pinned in the generated manifests. */
  compiler: string;
  /** The Turbo version pinned in the generated manifests. */
  turbo: string;
  /** The Vitest version pinned in the generated manifests. */
  vitest: string;
}>;

/** One generated workspace file, path-keyed relative to the destination directory. */
export type WorkspaceFile = Readonly<{ path: string; content: string }>;

const json = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => item, 2) + '\n';

const testConfig = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: { include: ['tests/**/*.ts'] },
});
`;
const projectConfig = (references: readonly { path: string }[]): unknown => ({
  extends: '@ts-calm/check/tsconfig.node.json',
  compilerOptions: {
    composite: true,
    noEmit: false,
    declaration: true,
    rewriteRelativeImportExtensions: true,
    rootDir: 'src',
    outDir: 'dist',
    types: [],
  },
  include: ['src/**/*.ts'],
  ...(references.length > 0 ? { references } : {}),
});

const rootPackage = (options: WorkspaceTemplateOptions): string =>
  json({
    name: 'typescript-workspace',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.22.0',
    engines: { node: '>=24' },
    scripts: {
      build: 'turbo run build',
      typecheck: 'turbo run typecheck',
      test: 'turbo run test',
      fmt: 'oxfmt --write .',
      'fmt:check': 'oxfmt --check .',
      lint: 'oxlint --type-aware .',
      check: 'ts-calm check',
    },
    devDependencies: {
      '@ts-calm/check': options.checkVersion,
      '@ts-calm/fp': options.fpVersion,
      oxfmt: '0.68.0',
      oxlint: '1.83.0',
      'oxlint-tsgolint': '7.0.2002',
      turbo: options.turbo,
      typescript: options.compiler,
      vitest: options.vitest,
    },
  });

const packageManifest = (
  name: string,
  options: WorkspaceTemplateOptions,
  extra: Readonly<Record<string, unknown>>,
): string =>
  json({
    name: `@workspace/${name}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        source: './src/index.ts',
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    scripts: {
      build: 'tsc -b tsconfig.json',
      typecheck: 'tsc -b tsconfig.json',
      test: 'vitest run',
    },
    devDependencies: {
      '@ts-calm/check': options.checkVersion,
      '@ts-calm/fp': options.fpVersion,
      oxfmt: '0.68.0',
      oxlint: '1.83.0',
      'oxlint-tsgolint': '7.0.2002',
      typescript: options.compiler,
      vitest: options.vitest,
    },
    ...extra,
  });

/**
 * Render a complete private pnpm + Turbo workspace as an ordered, path-keyed file set.
 *
 * The function is pure: nothing is written, and identical options always produce identical
 * content. Two example packages show the layout: `@workspace/a` depends on `@ts-calm/fp` and
 * `@workspace/b` depends on `@workspace/a`, so a single root command covers the whole graph.
 *
 * @param options - Pinned dependency versions to write into the generated manifests. Use
 * {@link bundledTemplateOptions} for the versions this package was published with.
 * @returns Every generated file as `{path, content}` pairs, ordered as created on disk.
 * @example
 * ```ts
 * const files = workspaceTemplate(bundledTemplateOptions());
 * const manifest = files.find((file) => file.path === 'package.json');
 * ```
 */
export const workspaceTemplate = (options: WorkspaceTemplateOptions): readonly WorkspaceFile[] => {
  const files: Record<string, string> = {
    'package.json': rootPackage(options),
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\nallowBuilds:\n  esbuild: true\n',
    'turbo.json': json({
      tasks: {
        build: { dependsOn: ['^build'], outputs: ['dist/**'] },
        typecheck: { dependsOn: ['^build'], outputs: [] },
        test: { dependsOn: ['^build'], outputs: [] },
      },
    }),
    '.gitignore': 'node_modules/\ndist/\n.turbo/\n.local/\ncoverage/\n*.tsbuildinfo\n',
    'oxlint.config.ts': "import preset from '@ts-calm/check/oxlint';\n\nexport default preset;\n",
    'oxfmt.config.ts': "import preset from '@ts-calm/check/oxfmt';\nexport default preset;\n",
    'vitest.workspace.ts': `import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['packages/*/vitest.config.ts']);
`,
    'README.md':
      '# TypeScript workspace\n\n`pnpm install` then `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check`, `pnpm test`.\n\nPackages own their builds and tests. Internal imports are relative and keep the `.ts` extension, which works in Node, bundlers and browsers alike.\n',
    'packages/a/package.json': packageManifest('a', options, {
      dependencies: { '@ts-calm/fp': options.fpVersion },
    }),
    'packages/a/tsconfig.json': json(projectConfig([])),
    'packages/a/src/index.ts': "export { displayName } from './value.ts';\n",
    'packages/a/src/value.ts': `import { err, isString, ok } from '@ts-calm/fp';
import type { Result } from '@ts-calm/fp';

/**
 * Validate a display name.
 *
 * @param value - Untrusted external value.
 * @returns The trimmed name, or a named problem.
 */
export const displayName = (value: unknown): Result<string, 'not-text' | 'empty'> => {
  if (!isString(value)) return err('not-text');
  const trimmed = value.trim();
  return trimmed.length > 0 ? ok(trimmed) : err('empty');
};
`,
    'packages/a/tests/value.ts': `import { expect, test } from 'vitest';
import { get, isErr, isOk } from '@ts-calm/fp';
import { displayName } from '../src/value.ts';

test('accepts a non-empty name', () => {
  const result = displayName('  reader ');
  expect(isOk(result) && get(result)).toBe('reader');
});

test('rejects empty and non-text input', () => {
  expect(isErr(displayName('   '))).toBe(true);
  expect(isErr(displayName(1))).toBe(true);
});
`,
    'packages/b/package.json': packageManifest('b', options, {
      dependencies: { '@workspace/a': 'workspace:*' },
    }),
    'packages/b/tsconfig.json': json(projectConfig([{ path: '../a' }])),
    'packages/b/src/index.ts': "export { greet } from './greet.ts';\n",
    'packages/b/src/greet.ts':
      "import { getOrElse } from '@ts-calm/fp';\nimport { displayName } from '@workspace/a';\n\n/**\n * Greet a reader by name.\n *\n * @param name - Untrusted external value.\n * @returns A greeting that falls back to `world`.\n */\nexport const greet = (name: unknown): string => {\n  const resolved: string = getOrElse(displayName(name), () => 'world');\n  return `Hello, ${resolved}!`;\n};\n",
    'packages/b/tests/greet.ts': `import { expect, test } from 'vitest';
import { greet } from '../src/greet.ts';

test('greets the supplied name through the dependency', () => {
  expect(greet('reader')).toBe('Hello, reader!');
});

test('falls back when the name is unusable', () => {
  expect(greet('')).toBe('Hello, world!');
});
`,
  };
  for (const directory of ['packages/a', 'packages/b']) {
    files[`${directory}/vitest.config.ts`] = testConfig;
  }
  return Object.entries(files).map(([path, content]) => ({ path, content }));
};
