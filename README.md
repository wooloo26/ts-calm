# ts-calm

Small conventions for personal TypeScript projects, split into two packages. Node 24+, ESM, MIT.
This repository is a template: copy it, then change what you need. Nothing here is published to npm.
[中文](README.zh-CN.md) · [Rule guide](docs/rules.md)

| Package                                      | Role                              |
| -------------------------------------------- | --------------------------------- |
| [`@ts-calm/fp`](packages/fp/README.md)       | Runtime: Option, Result, guards   |
| [`@ts-calm/check`](packages/check/README.md) | Tool: the `ts-calm` check command |

## Use as a template

```sh
git clone --depth 1 https://github.com/wooloo26/ts-calm.git my-project
cd my-project
rm -rf .git          # Windows: Remove-Item -Recurse -Force .git
pnpm install
pnpm verify
```

A ZIP download works the same way: unpack it, drop the `.git` directory and run `pnpm install`.
A copy carries every workspace-level file verbatim: the source rules, compiler project, test runner,
task runner, package manager settings, Lefthook hooks and editor defaults. `pnpm install` links
`@ts-calm/fp` and `@ts-calm/check` from `packages/`, so nothing is fetched from the npm registry.

Edit these first:

- The root `package.json`: `name`, `description` and any script you do not want.
- `ts-calm.config.ts`: the `commit-message` scopes and the allowed effect imports.
- `packages/`: keep, rename or delete the two example packages. Imports of `@ts-calm/fp` and
  `@ts-calm/check` keep resolving through the workspace as long as those directories are there.

The runtime and the tool are separate packages. The checker owns its source rules and the compiler
invocation: the project's own `tsconfig.json` drives `typecheck`, and formatting and linting stay the
project's own scripts. Package management, builds and tests stay yours.

## Commands and features

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `check` / `check --staged`     | The source rules, on the working tree or on a frozen Git index |
| `typecheck`                    | The pinned compiler over the project's own `tsconfig.json`     |
| `init`                         | Add a missing ESM `type` without replacing existing choices    |
| `explain <rule>`               | Explain a rule and its functional alternative                  |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`  |

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 at least one error-severity
violation, 2 execution/config errors. Warnings are reported without failing.
Formatting (`oxfmt --write .`, `oxfmt --check .`) and linting (`oxlint --type-aware .`) stay project
scripts, because a workspace runs them once for every package.

- `@ts-calm/fp`: Result, Option, combinators, safe guards, collection helpers and codecs.
- `@ts-calm/fp/boundary`: capture/captureAsync and their Result variants.
- `@ts-calm/check`: reusable checking APIs and `CheckConfig`.
- Source rules: commit message, function length, boundary, file cycles, directory cycles, strict-fp and purity.
- Inside a package, imports are relative and keep the `.ts` extension. Node-only `#` mappings are
  not readable by browsers, so a runtime package meant for the web does not use them.

Functions follow a pure-by-default convention. Mark known effects with `/** @impure reason */`.
Local loops and private data construction are allowed. This is bounded detection, not a proof
about arbitrary JavaScript. Direct host effects still belong in documented `.b.ts` files.
Prefer `fromNullable`, `capture`, guards and Option/Result handling before adding exceptions.

## Working on this workspace

This repository is a pnpm workspace: the two packages plus this private root.

```sh
pnpm install
pnpm build       # turbo: fp -> check
pnpm typecheck   # every package
pnpm check       # the source rules for the whole workspace
pnpm test        # vitest over packages/*/tests
pnpm verify      # build, typecheck, check, lint, fmt:check and test
```

Additional gates: `pnpm test:coverage` and `pnpm bench`. Reports stay in `.local/reports`.
`pnpm install` also wires the Lefthook hooks: `pre-commit` formats and checks the staged files, and
`commit-msg` checks the commit message.

Changes here become the next project's starting point, so behavior changes use TDD:
failing test, implementation, refactor. No test ritual for prose edits. Update the generated guide
with `pnpm run docs` after editing rule explanations; a test keeps `docs/rules.md` in step with the
rule help. That file is generated, so `pnpm fmt` ignores it.
