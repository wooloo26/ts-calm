# @ts-calm/check

The source-rule checker for calm TypeScript projects: commit message, function length, boundary,
file cycles, directory cycles, strict-fp and purity, with a pinned compiler for `typecheck`.
Node 24+, ESM, MIT.

This package depends on `oxc-parser`, `oxc-resolver` and `typescript`: the parser and resolver back
the source rules, and `typecheck` runs this pinned compiler instead of whatever the project happens
to have. It re-exports the bundled formatter and linter presets as plain data, so installing it
never installs a formatter or a linter.

## Install

```sh
pnpm add -D @ts-calm/check
pnpm exec ts-calm init
pnpm exec ts-calm check
pnpm exec ts-calm typecheck
```

## Commands

| Command                        | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `check` / `check --staged`     | The source rules, on the working tree or on a frozen Git index   |
| `typecheck`                    | The pinned compiler over the project's own `tsconfig.json`       |
| `init`                         | Add a missing `tsconfig.json` and ESM `type` without overwriting |
| `init --template pnpm-turbo`   | Generate a workspace with `@ts-calm/create-template`             |
| `explain <rule>`               | Explain a rule and its functional alternative                    |
| `commit-message --file <path>` | Check `scope - verb description`, e.g. `fp - add safe guards`    |

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 at least one error-severity
violation, 2 execution or configuration errors. Warnings are reported without failing.

Formatting and linting are project scripts, not commands, because they belong to the project's
toolchain and a workspace runs them once for every package. This package therefore ships no
formatter or linter API either; it only re-exports their presets as data. The generated template
wires both through the project's own binaries:

```json
{
  "scripts": {
    "fmt": "oxfmt --write .",
    "lint": "oxlint --type-aware .",
    "check": "ts-calm check"
  }
}
```

## Presets

| Entry                               | Purpose                            |
| ----------------------------------- | ---------------------------------- |
| `@ts-calm/check/tsconfig.json`      | Strict compiler defaults           |
| `@ts-calm/check/tsconfig.node.json` | Node 24 ESM compiler defaults      |
| `@ts-calm/check/oxlint`             | The bundled Oxlint preset, as data |
| `@ts-calm/check/oxfmt`              | The bundled Oxfmt preset, as data  |

A project configuration can simply re-export one, and the project supplies the binary:

```ts
// oxlint.config.ts
import preset from '@ts-calm/check/oxlint';

export default preset;
```

## API

`@ts-calm/check` exports `defineConfig`, `runChecks`, `analyzeSources`, `checkProject`,
`checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject`, `typecheckProject`,
`validateCommitMessage`, `formatDiagnostics`, `initializeProject`, `explainRule`, plus the
`CheckConfig`, `Diagnostic`, `RuleName`, `InitResult`, `CheckInput`, `SourceFile`, `StrictCheck`,
`ResolvedImport`, `ImportResolution` and `ImportFact` types and
`validateConfiguration`/`loadConfiguration`.

`checkProject`, `checkSourceProject`, `checkStaged`, `checkStagedMessage`, `withStagedProject` and
`initializeProject` are asynchronous and return promises. `checkProject` applies only the source
rules; `typecheckProject` runs the pinned compiler. There is no in-process formatter or linter: run
those as project scripts, which is what the presets above are for.

## Rules

See the repository rule guide at `docs/rules.md`.

Every exported symbol is documented and that coverage is enforced by a test in this package.
