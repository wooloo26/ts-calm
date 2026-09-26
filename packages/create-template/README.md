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

The destination must be absent or empty. Nothing is installed or started automatically.

The same template is reachable through the check command:

```sh
pnpm exec ts-calm init --template pnpm-turbo --cwd ./my-project
```

## What it generates

- A private root `package.json` with `fmt`, `lint`, `check`, `typecheck`, `build` and `test`
  scripts, pinned to the versions this package was published with.
- `packages/a` and `packages/b`: `a` uses `@ts-calm/fp`, `b` depends on `@workspace/a`, so the
  dependency graph, the project references and every root command have something real to cover.
- Relative internal imports that keep the `.ts` extension. Node, bundlers and browsers all read
  them, unlike Node-only `#` mappings.
- `oxlint.config.ts` and `oxfmt.config.ts` re-exporting the bundled `@ts-calm/check` presets.
- Per-package tests with Vitest and a Turbo pipeline for `build`, `typecheck` and `test`.

## API

`workspaceTemplate(options)` renders the workspace as pure `{path, content}` pairs.
`initializeWorkspace(directory, options?)` formats and writes them, refusing a nonempty
destination. `bundledTemplateOptions()` reports the versions this package ships with. The
`WorkspaceTemplateOptions` and `WorkspaceFile` types describe both.

Every exported symbol is documented and that coverage is enforced by a test in this package.
