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
starts nothing; `pnpm fmt` is the first step of the generated workspace and normalizes the tree, and
`pnpm install` wires the same Lefthook hooks this repository uses.

The same template is reachable through the check command:

```sh
pnpm exec ts-calm init --template pnpm-turbo --cwd ./my-project
```

## What it generates

- The workspace-level files of this repository, rendered verbatim: `.editorconfig`,
  `.gitattributes`, `.gitignore`, `.node-version`, `.oxlintrc.json`, `.oxfmtrc.json`, `tsconfig.json`,
  `turbo.json`, `pnpm-workspace.yaml`, `vitest.config.ts` and `lefthook.yml`. The package build
  copies them into `dist/template-files`, so an installed generator ships the same setup.
- A private root `package.json` derived from this repository's manifest: the same scripts, engines
  and package manager, with repository-only scripts (`bench`, `docs`, `test:package`,
  `test:template`) removed, `check` and `commit-message` running the published `ts-calm` binary, and
  every toolchain version pinned to the versions bundled with this package.
- `packages/a` and `packages/b`: `a` uses `@ts-calm/fp`, `b` depends on `@workspace/a`, so the
  dependency graph, the project references and every root command have something real to cover. Both
  extend the root `tsconfig.json` directly as `../../tsconfig.json` and keep a `vitest.config.ts` for
  package-scoped runs.
- Relative internal imports that keep the `.ts` extension. Node, bundlers and browsers all read
  them, unlike Node-only `#` mappings.
- Per-package builds with TypeScript project references and a Turbo pipeline for `build`,
  `typecheck` and `test`.

## API

`workspaceTemplate(options)` renders the workspace as pure `{path, content}` pairs.
`initializeWorkspace(directory, options?)` writes those pairs verbatim, refusing a nonempty
destination; the generator itself needs no formatter, linter or compiler, so the generated tree is
normalized by the workspace's own first `pnpm fmt`. `bundledTemplateOptions()` reports the versions
this package ships with. The `WorkspaceTemplateOptions`, `WorkspaceFile` and `WorkspaceResult` types
describe the options, files and result.

Every exported symbol is documented and that coverage is enforced by a test in the workspace.
