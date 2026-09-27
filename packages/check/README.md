# @ts-calm/check

Source-rule checker and pinned TypeScript compiler. Node 24+, ESM.

## CLI

| Command                        | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `check` / `check --staged`     | Check working sources or the Git index              |
| `typecheck`                    | Run the pinned compiler with the project's tsconfig |
| `init`                         | Add a missing ESM package type                      |
| `explain <rule>`               | Show a rule and its alternative                     |
| `commit-message --file <path>` | Validate the commit message                         |

Commands accept `--cwd <directory>` and `--json`. Exit codes: **0** passed,
**1** error diagnostics, **2** operational failure. See [rules and analysis limits](../../docs/rules.md).
Staged checks use index bytes and staged workspace packages; installed third-party dependencies
are reused. Missing staged dependencies fail explicitly.

## API

| API                                                                                                  | Returns                                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `validateConfiguration`                                                                              | `Result<CheckConfig, CheckIssue>`                                     |
| `loadConfiguration`, `typecheckProject`                                                              | Synchronous `Result`                                                  |
| `checkProject` (also `checkSourceProject`), `checkStaged`, `checkStagedMessage`, `initializeProject` | `AsyncResult`                                                         |
| `withStagedProject`                                                                                  | `AsyncResult`; its callback returns `Result` or `PromiseLike<Result>` |

Rule violations are `Ok<Diagnostic[]>`; `Err` means an operation failed. `CheckFailure`
retains the issue, external `Fault`, or both operation and cleanup failures. Use `failureMessage`
to render it. Pure rule and formatting APIs return their values directly; see [exports](src/index.ts).

Configuration loading is synchronous and follows Node's module cache. Restart long-lived callers
after configuration edits; each CLI invocation already starts a new process.

## Example

This [typechecked example](tests/fixtures/check-example.ts) validates input before I/O and handles
failures at the presentation edge:

```ts
import { get, isErr, map, match } from '@ts-calm/fp';
import { checkProject, validateConfiguration, failureMessage } from '@ts-calm/check';

/** @impure Read a project only after the configuration has been decoded successfully. */
export const reviewProject = async (root: string, input: unknown) => {
  const config = validateConfiguration(input);
  if (isErr(config)) return config;
  return map(await checkProject(root, get(config)), (diagnostics) => ({
    diagnostics,
    passed: diagnostics.every((issue) => issue.severity !== 'error'),
  }));
};

/** @impure Read the project and present either its report or a normalized operational failure. */
export const reviewSummary = async (root: string, input: unknown) =>
  match(await reviewProject(root, input), {
    ok: (report) =>
      report.passed ? 'Checks passed.' : `${report.diagnostics.length} diagnostics.`,
    err: failureMessage,
  });
```
