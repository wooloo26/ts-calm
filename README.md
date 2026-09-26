# ts-calm

Private TypeScript workspace template: functional runtime, source-rule checker and its own
toolchain. Node 24+, ESM, MIT. Nothing is published — copy the repository and edit it.

## Features

| Package                                      | Provides                                       |
| -------------------------------------------- | ---------------------------------------------- |
| [`@ts-calm/fp`](packages/fp/README.md)       | Option, Result, combinators, guards, codecs    |
| [`@ts-calm/check`](packages/check/README.md) | Source rules, pinned `typecheck`, reusable API |

- Source rules: commit message, function length, boundary, file cycles, directory cycles, strict-fp
  and purity — see [docs/rules.md](docs/rules.md).
- Pure by default: mark known effects `/** @impure reason */`; real host effects live in documented
  `.b.ts` files.
- The portable FP runtime uses relative `.ts` imports; the Node-only checker uses package-local `#src` mappings.
- Formatting and linting stay project scripts: `oxfmt` and `oxlint` are never bundled.

## Commands

| Command                              | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| `pnpm verify`                        | build, typecheck, check, lint, fmt:check, test, test:dist       |
| `pnpm build` / `pnpm typecheck`      | turbo `fp -> check` / per package                               |
| `pnpm check` / `pnpm check --staged` | source rules on the tree or on the Git index                    |
| `pnpm lint` / `pnpm fmt`             | `oxlint --type-aware .` / `oxfmt --write .`                     |
| `pnpm test` / `pnpm test:coverage`   | vitest over `packages/*/tests` and coverage thresholds          |
| `pnpm test:dist`                     | smoke-test built FP exports and every CLI command after a build |
| `pnpm bench`                         | vitest benchmarks                                               |
| `pnpm run docs`                      | regenerate `docs/rules.md` from the rule help                   |
| `pnpm commit-message --file <path>`  | check `scope - description`                                     |

`packages/check` owns the `ts-calm` binary: `check [--staged]`, `typecheck`, `init`, `explain <rule>`
and `commit-message --file <path>`, each accepting `--json` and `--cwd <directory>`. Exit codes:
0 passed, 1 error-severity violation, 2 execution or configuration error.

## Use as a template

```sh
git clone --depth 1 https://github.com/wooloo26/ts-calm.git my-project
cd my-project
rm -rf .git          # Windows: Remove-Item -Recurse -Force .git
git init
pnpm install
pnpm exec lefthook install
pnpm verify
```

Edit the root `package.json` and commit scopes in `ts-calm.config.ts`, then add application packages
under `packages/`. The existing `fp` and `check` packages are infrastructure, not disposable examples:
root commands use `check`, and `check` depends on `fp`.

To remove the checker, first remove its root dependency and the `check`, `commit-message`, `docs`
and `test:dist` scripts, their calls from `verify` and CI, the built-CLI and commit-policy CI steps,
the check and commit-message jobs in `lefthook.yml`, and `ts-calm.config.ts`. Then remove
`packages/check` and `docs/rules.md`. Keep `fp` while any package imports it; remove it only after
replacing those imports. Run `pnpm install` to update the workspace lockfile, then run the remaining
verification commands. Renaming either package also requires updating imports, scripts, and workspace dependencies.

See the [typechecked FP example](packages/fp/README.md#input-to-output) for an end-to-end flow.
Behavior changes use regression tests first; `pnpm run docs` keeps the rule guide synchronized.

Purity checking reports known effects, not a proof that all other code is pure. Context-sensitive
analysis has a fixed per-function expansion budget; `purity/incomplete` is a warning that some
calls remain unproven. Existing error diagnostics still fail the command. Performance reports from
`pnpm bench` cover independent modules, call graphs, and a cold check of this repository.
