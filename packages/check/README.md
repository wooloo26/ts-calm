# @ts-calm/check

The source-rule checker for calm TypeScript projects: commit message, function length, boundary,
file cycles, directory cycles, strict-fp and purity, with a pinned compiler for `typecheck`.
Node 24+, ESM, MIT.

This package pins `oxlint`, `oxlint-tsgolint`, `oxc-parser`, `oxc-resolver`, `oxfmt` and
`typescript`, so a project installs one pinned toolchain instead of six, and re-exports the
formatter and linter presets.

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

Commands support `--cwd` and `--json`. Exit codes: 0 passed, 1 violations, 2 execution or
configuration errors.

Formatting and linting are project scripts, not commands, because they belong to the project's
toolchain and a workspace runs them once for every package. The generated template wires both
through the pinned binaries and the exported presets:

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

| Entry                               | Purpose                       |
| ----------------------------------- | ----------------------------- |
| `@ts-calm/check/tsconfig.json`      | Strict compiler defaults      |
| `@ts-calm/check/tsconfig.node.json` | Node 24 ESM compiler defaults |
| `@ts-calm/check/oxlint`             | The bundled Oxlint preset     |
| `@ts-calm/check/oxfmt`              | The bundled Oxfmt preset      |

A project configuration can simply re-export one:

```ts
// oxlint.config.ts
import preset from '@ts-calm/check/oxlint';

export default preset;
```

## API

`@ts-calm/check` exports `defineConfig`, `runChecks`, `analyzeSources`, `checkProject`,
`checkSourceProject`, `checkStaged`, `checkStagedMessage`, `formatProject`, `lintProject`,
`typecheckProject`, `validateCommitMessage`, `formatDiagnostics`, `initializeProject`,
`explainRule`, plus the `CheckConfig`, `Diagnostic` and `RuleName` types and
`validateConfiguration`/`loadConfiguration`.

`checkProject`, `checkSourceProject`, `checkStaged`, `checkStagedMessage`, `formatProject` and
`initializeProject` are asynchronous and return promises. `checkProject` applies only the source
rules; `formatProject` and `lintProject` are available when a caller wants them in process.

## Rules

See the repository rule guide at `docs/rules.md`.

Every exported symbol is documented and that coverage is enforced by a test in this package.
