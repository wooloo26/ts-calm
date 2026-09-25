# ts-calm

Small conventions for personal TypeScript projects. Node 24+, ESM, MIT.
[中文](README.zh-CN.md) · [Rule guide](docs/rules.md)

## Start

```sh
pnpm add ts-calm
pnpm exec ts-calm init
pnpm exec ts-calm fmt
pnpm exec ts-calm check
```

Before the first npm publication, install the verified tarball instead.
One package includes pinned formatting, lint and TypeScript tools. Importing the
functional library does not load them. Package management, builds and tests stay yours.

## Commands and features

| Command                        | Purpose                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `check` / `check --staged`     | Format, type-aware lint, tsc and source rules; no source changes      |
| `fmt` / `fmt --check`          | Format / inspect formatting                                           |
| `lint` / `typecheck`           | Run the selected static checks                                        |
| `init`                         | Add missing Node ESM configuration without replacing existing choices |
| `explain <rule>`               | Explain a rule and its functional alternative                         |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`         |

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 violations, 2 execution/config errors.

- `ts-calm`: Result, Option, combinators, safe guards, collection helpers and codecs.
- `ts-calm/boundary`: capture/captureAsync and their Result variants.
- `ts-calm/check`: reusable checking APIs and `CheckConfig`.
- Source rules: commit message, function length, boundary, file cycles, directory cycles, strict-fp and purity.
- Internal imports use Node-native `#` mappings. Tests and development select source; published code selects `dist`.

Functions follow a pure-by-default convention. Mark known effects with `/** @impure reason */`.
Local loops and private data construction are allowed. This is bounded detection, not a proof
about arbitrary JavaScript. Direct host effects still belong in documented `.b.ts` files.
Prefer `fromNullable`, `capture`, guards and Option/Result handling before adding exceptions.

## Workspace template

```sh
pnpm exec ts-calm init --template pnpm-turbo --cwd ./my-project
cd my-project
pnpm install
pnpm build && pnpm check && pnpm test && pnpm start
```

Creates a private app/shared workspace with native `#src/*`, Turbo and a runnable example.
The destination must be absent or empty; nothing is installed or started automatically.
This repository itself remains a single package.

## Working on this package

Use TDD for behavior changes: failing test, implementation, refactor. No test ritual for prose edits.
`pnpm verify` is the normal check; `pnpm test -- <path>` narrows tests.
Use `test:coverage` for reports, `test:mutation` for two focused targets, and `bench` for hotspots.
Mutation and timing scores do not block ordinary commits. Reports stay in `.local/reports`.
`test:package` and `test:template` validate real installs and generated projects.
Update the generated guide with `pnpm run docs` after editing rule explanations.

Manual npm upload only: `npm publish .local/release/ts-calm-0.1.0.tgz --access public`.
