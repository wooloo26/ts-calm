const json = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => item, 2) + '\n';

const testConfig = `import { defineConfig } from 'vitest/config';
export default defineConfig({resolve:{conditions:['workspace-source']},ssr:{resolve:{conditions:['workspace-source']}},test:{include:['tests/**/*.ts']}});
`;
const compilerConfig = {
  extends: 'ts-calm/tsconfig.node.json',
  compilerOptions: { customConditions: ['workspace-source'] },
  include: ['src/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
};
const buildConfig = {
  extends: './tsconfig.json',
  compilerOptions: {
    noEmit: false,
    declaration: true,
    rewriteRelativeImportExtensions: true,
    customConditions: [],
    rootDir: 'src',
    outDir: 'dist',
  },
  include: ['src/**/*.ts'],
};

const rootPackage = (version: string, compiler: string): string =>
  json({
    name: 'typescript-workspace',
    private: true,
    type: 'module',
    packageManager: 'pnpm@11.22.0',
    engines: { node: '>=24' },
    scripts: {
      build: 'turbo run build',
      check: 'turbo run check',
      test: 'turbo run test',
      fmt: 'turbo run fmt',
      start: 'pnpm --filter @workspace/app start',
    },
    devDependencies: {
      'ts-calm': version,
      typescript: compiler,
      turbo: '2.11.4',
      vitest: '5.0.1',
    },
  });

export const workspaceTemplate = (
  version: string,
  compiler: string,
): Readonly<Record<string, string>> => {
  const files: Record<string, string> = {
    'package.json': rootPackage(version, compiler),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\nallowBuilds:\n  esbuild: true\n',
    'turbo.json': json({
      tasks: {
        build: { dependsOn: ['^build'], outputs: ['dist/**'] },
        check: { dependsOn: ['^build'], outputs: [] },
        test: { dependsOn: ['^build'], outputs: [] },
        fmt: { cache: false },
      },
    }),
    '.gitignore': 'node_modules/\ndist/\n.turbo/\n.local/\ncoverage/\n',
    'tsconfig.json': json({
      extends: 'ts-calm/tsconfig.node.json',
      compilerOptions: { customConditions: ['workspace-source'] },
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
    }),
    'oxlint.config.ts': "import preset from 'ts-calm/oxlint';\nexport default preset;\n",
    'oxfmt.config.ts': "import preset from 'ts-calm/oxfmt';\nexport default preset;\n",
    'README.md':
      '# TypeScript workspace\n\n`pnpm install` then `pnpm build`, `pnpm check`, `pnpm test`, `pnpm start`.\n\nPackages own their builds and tests. Internal imports use native `#src/*`; cross-package imports use the public package name.\n',
    'packages/shared/src/index.ts': "export { greet } from '#src/greet';\n",
    'packages/shared/src/greet.ts':
      'export const greet = (name: string): string => `Hello, ${name}!`;\n',
    'packages/shared/tests/greet.ts':
      "import { expect, test } from 'vitest';\nimport { greet } from '#src/greet';\ntest('greets the supplied name', () => { expect(greet('world')).toBe('Hello, world!'); });\n",
    'apps/app/src/message.ts':
      "import { greet } from '@workspace/shared';\nexport const message = (name: string): string => greet(name);\n",
    'apps/app/src/main.b.ts': `/**
 * @boundary Read the CLI name and print the shared greeting.
 * @effects process
 * @effects console
 */
import { fromNullable, getOrElse } from 'ts-calm';
import { message } from '#src/message';
/** @impure Read arguments and write the greeting to stdout. */
export const main = (): void => { console.log(message(getOrElse(fromNullable(process.argv[2]), () => 'world'))); };
main();
`,
    'apps/app/tests/message.ts':
      "import { expect, test } from 'vitest';\nimport { message } from '#src/message';\ntest('uses the shared greeting', () => { expect(message('reader')).toBe('Hello, reader!'); });\n",
  };
  for (const [directory, name, entry] of [
    ['packages/shared', 'shared', 'index'],
    ['apps/app', 'app', 'message'],
  ]) {
    if (!directory || !name || !entry) continue;
    files[`${directory}/package.json`] = json({
      name: `@workspace/${name}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      imports: { '#src/*': { 'workspace-source': './src/*.ts', default: './dist/*.js' } },
      exports: {
        '.': {
          source: `./src/${entry}.ts`,
          types: `./dist/${entry}.d.ts`,
          import: `./dist/${entry}.js`,
        },
      },
      scripts: {
        build: 'tsc -p tsconfig.build.json',
        check: 'ts-calm check',
        test: 'vitest run',
        fmt: 'ts-calm fmt',
        ...(name === 'app' ? { start: 'node dist/main.b.js' } : {}),
      },
      dependencies: {
        'ts-calm': version,
        ...(name === 'app' ? { '@workspace/shared': 'workspace:*' } : {}),
      },
    });
    files[`${directory}/tsconfig.json`] = json(compilerConfig);
    files[`${directory}/tsconfig.build.json`] = json(buildConfig);
    files[`${directory}/vitest.config.ts`] = testConfig;
  }
  return files;
};
