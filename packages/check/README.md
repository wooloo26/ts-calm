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
| `commit-message --file <path>` | Check `scope - description`, e.g. `fp - add safe guards`       |

Every command accepts `--cwd <directory>` and `--json`. Exit codes: 0 passed, 1 error-severity
violation, 2 execution or configuration error. The rules are listed in
[docs/rules.md](../../docs/rules.md).

Staged checks reuse installed third-party dependencies, but resolve workspace packages inside the
index snapshot. Missing staged manifests or export targets fail explicitly. Installed dependencies
must match the lockfile; the checker does not install or freeze third-party dependency contents.

Purity analysis tracks known effects and common reference/collection operations. Unknown third-party
behavior, dynamic dispatch, recursive allocation factories and recursive heap traversal remain
unproven. An expansion budget bounds expensive call graphs and reports `purity/incomplete` warnings
when exhausted; a successful exit alone is not a proof of purity. Configuration fields and exit
codes are unchanged.

## API

Exports `defineConfig`, `runChecks`, `analyzeSources`, `checkProject`, `checkSourceProject`,
`checkStaged`, `checkStagedMessage`, `withStagedProject`, `typecheckProject`, `validateCommitMessage`,
`formatDiagnostics`, `initializeProject`, `explainRule`, `validateConfiguration`/`loadConfiguration`,
plus the `CheckConfig`, `Diagnostic`, `RuleName`, `InitResult`, `CheckInput`, `SourceFile`,
`StrictCheck`, `ResolvedImport`, `ImportResolution` and `ImportFact` types. `checkProject`,
`checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject` and `initializeProject`
are asynchronous.

See [necessary line allowances](../../docs/allow.md) for boundary exceptions and fp replacements.
