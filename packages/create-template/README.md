# @ts-calm/create-template

Generate a private pnpm + Turbo TypeScript workspace that already uses the `@ts-calm` packages.
Node 24+, ESM, MIT.

## Use

```sh
pnpm dlx @ts-calm/create-template my-project
cd my-project
pnpm install
pnpm fmt && pnpm lint && pnpm typecheck && pnpm build && pnpm check && pnpm test
```

The destination must be absent or empty. The generator has no runtime dependencies and installs and
starts nothing; `pnpm fmt` is the first step of the generated workspace and normalizes the tree.

The same template is reachable through the check command:

```sh
pnpm exec ts-calm init --template pnpm-turbo --cwd ./my-project
```

## What it generates

- A private root `package.json` with `fmt`, `fmt:check`, `lint`, `check`, `typecheck`, `build` and
  `test` scripts, pinned to the versions bundled with this package.
- `packages/a` and `packages/b`: `a` uses `@ts-calm/fp`, `b` depends on `@workspace/a`, so the
  dependency graph, the project references and every root command have something real to cover.
- Relative internal imports that keep the `.ts` extension. Node, bundlers and browsers all read
  them, unlike Node-only `#` mappings.
- `oxlint.config.ts` and `oxfmt.config.ts` re-exporting the bundled `@ts-calm/check` presets.
- A root `tsconfig.json` that also covers the configuration files and every test file, and a root
  `vitest.config.ts` that lists both packages as projects.
- Per-package tests with Vitest and a Turbo pipeline for `build`, `typecheck` and `test`.

## API

`workspaceTemplate(options)` renders the workspace as pure `{path, content}` pairs.
`initializeWorkspace(directory, options?)` writes those pairs verbatim, refusing a nonempty
destination; the generator itself needs no formatter, linter or compiler, so the generated tree is
normalized by the workspace's own first `pnpm fmt`. `bundledTemplateOptions()` reports the versions
this package ships with. The `WorkspaceTemplateOptions`, `WorkspaceFile` and `WorkspaceResult` types
describe the options, files and result.

Every exported symbol is documented and that coverage is enforced by a test in the workspace.
