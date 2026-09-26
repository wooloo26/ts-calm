# ts-calm

Small conventions for personal TypeScript projects, split into three packages. Node 24+, ESM, MIT.
[中文](README.zh-CN.md) · [Rule guide](docs/rules.md)

| Package                                                          | Role                              |
| ---------------------------------------------------------------- | --------------------------------- |
| [`@ts-calm/fp`](packages/fp/README.md)                           | Runtime: Option, Result, guards   |
| [`@ts-calm/check`](packages/check/README.md)                     | Tool: the `ts-calm` check command |
| [`@ts-calm/create-template`](packages/create-template/README.md) | Workspace generator               |

## Start

```sh
pnpm add -D @ts-calm/check
pnpm add @ts-calm/fp
pnpm exec ts-calm init
pnpm exec ts-calm typecheck
pnpm exec ts-calm check
```

The runtime and the tool are separate packages. Installing `@ts-calm/check` brings the pinned
parser, resolver and compiler; importing `@ts-calm/fp` never loads them. Formatting and linting
stay the project's own scripts, so neither package pulls in a formatter or a linter — only their
presets are re-exported, as data.
Package management, builds and tests stay yours.

## Commands and features

| Command                        | Purpose                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `check` / `check --staged`     | The source rules, on the working tree or on a frozen Git index        |
| `typecheck`                    | The pinned compiler over the project's own `tsconfig.json`            |
| `init`                         | Add missing Node ESM configuration without replacing existing choices |
| `init --template pnpm-turbo`   | Generate a workspace with `@ts-calm/create-template`                  |
| `explain <rule>`               | Explain a rule and its functional alternative                         |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`         |

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 at least one error-severity
violation, 2 execution/config errors. Warnings are reported without failing.
Formatting (`oxfmt --write .`, `oxfmt --check .`) and linting (`oxlint --type-aware .`) stay project
scripts, because a workspace runs them once for every package.

- `@ts-calm/fp`: Result, Option, combinators, safe guards, collection helpers and codecs.
- `@ts-calm/fp/boundary`: capture/captureAsync and their Result variants.
- `@ts-calm/check`: reusable checking APIs and `CheckConfig`.
- `@ts-calm/check/tsconfig.node.json`, `/oxlint`, `/oxfmt`: the bundled presets.
- Source rules: commit message, function length, boundary, file cycles, directory cycles, strict-fp and purity.
- Inside a package, imports are relative and keep the `.ts` extension. Node-only `#` mappings are
  not readable by browsers, so a runtime package meant for the web does not use them.

Functions follow a pure-by-default convention. Mark known effects with `/** @impure reason */`.
Local loops and private data construction are allowed. This is bounded detection, not a proof
about arbitrary JavaScript. Direct host effects still belong in documented `.b.ts` files.
Prefer `fromNullable`, `capture`, guards and Option/Result handling before adding exceptions.

## Workspace template

```sh
pnpm dlx @ts-calm/create-template my-project
cd my-project
pnpm install
pnpm fmt && pnpm lint && pnpm typecheck && pnpm build && pnpm check && pnpm test
```

Creates a private `packages/a` + `packages/b` workspace with Turbo, project references, per-package
tests and a runnable example. The destination must be absent or empty; nothing is installed or
started automatically.

## Publishing

The three packages are published manually, in dependency order, from their built output:

```sh
pnpm build
pnpm test:package
npm publish packages/fp --access public
npm publish packages/create-template --access public
npm publish packages/check --access public
```

`pnpm test:package` packs the workspace packages into `.local/release`, replaces the internal
`workspace:*` ranges with the packed tarballs, and proves a real npm and pnpm install: `init`
idempotence, the CLI, the type declarations, and that `@ts-calm/fp` loads without a check tool.

## Working on this workspace

This repository is a pnpm workspace of the three packages plus this private root.

```sh
pnpm install
pnpm build       # turbo: fp -> create-template -> check
pnpm typecheck   # every package
pnpm check       # the source rules for the whole workspace
pnpm test        # vitest over packages/*/tests
pnpm verify      # build, typecheck, check, lint, fmt:check and test
```

Additional gates: `pnpm test:coverage`, `pnpm bench`, `pnpm test:package` and `pnpm test:template`.
Reports stay in `.local/reports`.
Use TDD for behavior changes: failing test, implementation, refactor. No test ritual for prose edits.
Update the generated guide with `pnpm run docs` after editing rule explanations; a test keeps
`docs/rules.md` in step with the rule help.
