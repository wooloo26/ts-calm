# @ts-calm/check

The source-rule checker for calm TypeScript projects: commit message, function length, boundary,
file cycles, directory cycles, strict-fp and purity, with a pinned compiler for `typecheck`.
Node 24+, ESM, MIT.

This package depends on `oxc-parser`, `oxc-resolver` and `typescript`: the parser and resolver back
the source rules, and `typecheck` runs this pinned compiler instead of whatever the project happens
to have. It carries no formatter, linter or compiler configuration; those belong to the project's
own toolchain.

## Install

```sh
pnpm add -D @ts-calm/check
pnpm exec ts-calm init
pnpm exec ts-calm typecheck
pnpm exec ts-calm check
```

`init` only adds a missing ESM `type` to `package.json`. A project provides its own `tsconfig.json`
for `typecheck`; `@ts-calm/create-template` generates a workspace that already has one.

## Commands

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `check` / `check --staged`     | The source rules, on the working tree or on a frozen Git index |
| `typecheck`                    | The pinned compiler over the project's own `tsconfig.json`     |
| `init`                         | Add a missing ESM `type` without overwriting existing choices  |
| `init --template pnpm-turbo`   | Generate a workspace with `@ts-calm/create-template`           |
| `explain <rule>`               | Explain a rule and its functional alternative                  |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`  |

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 at least one error-severity
violation, 2 execution or configuration errors. Warnings are reported without failing.

`check` reports only the rules this tool owns. Formatting, linting and the compiler configuration
stay with the project's own toolchain: a project runs its formatter and linter binaries directly,
and `@ts-calm/create-template` renders a workspace that wires both up around `ts-calm check`.

## API

`@ts-calm/check` exports `defineConfig`, `runChecks`, `analyzeSources`, `checkProject`,
`checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject`, `typecheckProject`,
`validateCommitMessage`, `formatDiagnostics`, `initializeProject`, `explainRule`, plus the
`CheckConfig`, `Diagnostic`, `RuleName`, `InitResult`, `CheckInput`, `SourceFile`, `StrictCheck`,
`ResolvedImport`, `ImportResolution` and `ImportFact` types and
`validateConfiguration`/`loadConfiguration`.

`checkProject`, `checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject` and
`initializeProject` are asynchronous and return promises. `checkProject` applies only the source
rules; `typecheckProject` runs the pinned compiler over the project's own configuration. There is
no in-process formatter or linter: projects run their own.

## Rules

See the repository rule guide at `docs/rules.md`.

Every exported symbol is documented and that coverage is enforced by a test in this package.
