# @ts-calm/check

Source-rule checker and pinned-compiler `typecheck` for calm TypeScript projects. Node 24+, ESM, MIT.
It depends on `oxc-parser`, `oxc-resolver` and `typescript`, and carries no formatter, linter or
compiler configuration of its own.

## Commands

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `check` / `check --staged`     | The source rules, on the working tree or on a frozen Git index |
| `typecheck`                    | The pinned compiler over the project's own `tsconfig.json`     |
| `init`                         | Add a missing ESM `type` without overwriting existing choices  |
| `explain <rule>`               | Explain a rule and its functional alternative                  |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`  |

Every command accepts `--cwd <directory>` and `--json`. Exit codes: 0 passed, 1 error-severity
violation, 2 execution or configuration error. The rules are listed in
[docs/rules.md](../../docs/rules.md).

## API

Exports `defineConfig`, `runChecks`, `analyzeSources`, `checkProject`, `checkSourceProject`,
`checkStaged`, `checkStagedMessage`, `withStagedProject`, `typecheckProject`, `validateCommitMessage`,
`formatDiagnostics`, `initializeProject`, `explainRule`, `validateConfiguration`/`loadConfiguration`,
plus the `CheckConfig`, `Diagnostic`, `RuleName`, `InitResult`, `CheckInput`, `SourceFile`,
`StrictCheck`, `ResolvedImport`, `ImportResolution` and `ImportFact` types. `checkProject`,
`checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject` and `initializeProject`
are asynchronous.
