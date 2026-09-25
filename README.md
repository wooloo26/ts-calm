# ts-calm

Calm defaults for TypeScript: functional values, explicit boundaries and one complete
static check command. MIT licensed. Node 24+ for the CLI.

[中文说明](README.zh-CN.md) · [Rule guide](docs/rules.md) · [Contributing](CONTRIBUTING.md)

## Start

```sh
npm install ts-calm
npx ts-calm init
npx ts-calm fmt
npx ts-calm check
```

With pnpm, use `pnpm add ts-calm` and `pnpm exec ts-calm <command>`.
Before the first npm publication, install the CI tarball instead of the package name.

One installation includes pinned TypeScript, Oxfmt, Oxlint and oxlint-tsgolint.
It works with npm's and pnpm's dependency layouts; no duplicate tool installation is
required. The functional root entry does not load Node or any of these tools.
The installation includes their files because this is deliberately one package.

The project owns its package manager, workspace, build and tests. ts-calm does not
install hooks, schedule tasks, build dependencies, or introduce module manifests.

| Entry                                                 | API                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ts-calm`                                             | Result, Option, combinators, collection helpers, type guards, codecs         |
| `ts-calm/boundary`                                    | capture, captureAsync, captureResult, captureResultAsync                     |
| `ts-calm/check`                                       | checkProject, checkStaged, checkLint, runChecks, CheckConfig and diagnostics |
| `ts-calm/oxlint`, `ts-calm/oxfmt`                     | Native configuration presets                                                 |
| `ts-calm/tsconfig.json`, `ts-calm/tsconfig.node.json` | Strict and Node ESM compiler presets                                         |

## Commands

| Command                        | Behavior                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `check`                        | Format checking, type-aware lint, tsc and all custom rules; no source changes |
| `check --staged`               | The complete check on one Git index snapshot                                  |
| `fmt` / `fmt --check`          | Format with Oxfmt / inspect formatting without writing                        |
| `lint`                         | Type-aware Oxlint and custom source rules                                     |
| `typecheck`                    | tsc with the project's tsconfig and no emit                                   |
| `init`                         | Create only missing configuration                                             |
| `explain strict-fp/no-try`     | Offline explanation and a functional alternative                              |
| `commit-message --file <path>` | Validate a message using the staged policy                                    |

Commands accept `--cwd <directory>` and `--json`. Check commands emit diagnostic arrays
with `rule`, `file`, `line`, `column`, `severity`, `message` and optional `help`/`docs`.
Operational JSON failures use `{error:{kind:"operational",message}}`.
Exit codes are 0 for success/warnings, 1 for code violations, 2 for invalid inputs or
tool execution failures. Checking never silently skips a missing compiler configuration.
`check` uses owned temporary compiler caches; it does not modify project build caches.

## Small configuration

`init` defaults to Node ESM. It creates a tsconfig extending the packaged Node preset,
plus `oxlint.config.ts` and `oxfmt.config.ts` importing the native presets. Node ambient
types are included through the type-only `ts-calm/node` bridge, even under pnpm.

Existing JSON/JSONC/TS/MTS tool configs and tsconfig are preserved. Only a missing
`package.json` `type` is set to `module`; an existing different value is kept with a
warning. Dependency lists, scripts, workspace and package-manager fields are untouched.
Running init again makes no changes. Frontend projects keep their own compiler settings
and can extend just the strict preset.

Tool commands prefer native project configs; otherwise they use the bundled defaults.
The lint baseline retains correctness errors, TypeScript/Unicorn/import/promise plugins,
and explicit floating-Promise, misused-Promise, any, non-null and exhaustiveness checks.

Optional `ts-calm.config.ts` configures the source rules:

```ts
import { defineConfig } from 'ts-calm/check';

export default defineConfig({
  effectImports: ['better-sqlite3', 'some-network-sdk'],
  rules: {
    'commit-message': { scopes: ['root', 'app'] },
    'function-length': { warning: 80, maximum: 150 },
    'strict-fp': { 'no-null': false },
  },
  overrides: [{ files: ['tests/**'], rules: { 'strict-fp': true } }],
});
```

It is synchronous trusted project code; top-level await is unsupported. `files` and
`ignores` accept `/` paths and `*`, `**`, `?` globs. `effectImports` contains exact import
specifiers. Rules can be disabled with `false`; cycle rules and commit policy are
project-wide. Native tool configuration remains in each tool's own format.

## Six source rules

| Rule               | Default                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `commit-message`   | `type(scope): description`, ASCII throughout, subject <= 100 characters         |
| `function-length`  | Warn above 80 effective lines; error above 150                                  |
| `boundary`         | Direct effects require a documented `.b.ts`; annotations must match actual code |
| `no-file-cycles`   | Reject value, type-only, re-export and literal dynamic-import cycles            |
| `no-module-cycles` | Each source directory is a module; reject cycles between directories            |
| `strict-fp`        | Reject the explicit syntax restrictions listed in the rule guide                |

A module cycle can exist without a file cycle: `orders/read.ts -> stock/types.ts`
and `stock/write.ts -> orders/types.ts` already make the two directories depend on each
other. Reports show the directory loop and actual import locations. Nested and test
directories are modules too; same-directory edges only affect the file-cycle rule.

Supported source is TypeScript using ESM syntax (`.ts`, `.tsx`, `.mts`, `.cts`). Only
`.b.ts` has boundary meaning. Installed dependencies, build output, declarations,
`.git` and `.local` are excluded. Test/fixture/scripts directories and test/config
files skip boundary/strict-fp by default, but remain in both cycle and length checks.

The graph resolves standard package exports/imports, tsconfig paths and workspace
packages with exports. Unresolved imports, excluded project targets, computed imports,
CommonJS require and syntax failures are reported. Install dependencies first; any
required generated declarations remain the project's responsibility.

Local `let`, loops, `as const`, native JSON and pure third-party imports are allowed.
These are explicit conventions, not a proof of purity or deep immutability.
In ts-calm commands, any/non-null diagnostics are owned by strict-fp, including disabled
checks and valid boundary exceptions, so they are not duplicated by Oxlint. Promise and
exhaustiveness lint stay independent. Direct Oxlint/editor invocation follows its native
config and does not interpret ts-calm boundary annotations.

## Prefer functional helpers

Containers are immutable and opaque. Use `ok`, `err`, `some`, `none`, predicates,
`get` and `getError`. `get` requires a known successful/present variant.

```ts
import { ok, map, fromNullable, getOrElse } from 'ts-calm';

const incremented = map(ok(3), (value) => value + 1);
const name = getOrElse(fromNullable(externalName), () => 'anonymous');
```

`fromNullable` preserves 0, false and the empty string. A real protocol null is not
necessarily absence. `no-try` diagnostics recommend the capture family, including
captureResult variants for operations already returning Result. Ordinary combinators
do not swallow callback defects. [The canonical rule guide](docs/rules.md) and `explain`
share the same explanations; no automatic try/finally rewrite is attempted.

```ts
/**
 * @boundary Read external configuration and represent filesystem failure as Result.
 * @effects node:fs/promises
 */
import { readFile } from 'node:fs/promises';
import { captureAsync } from 'ts-calm/boundary';

export const readConfiguration = (path: string) =>
  captureAsync(() => readFile(path, 'utf8'), { name: 'read-config' });
```

Using capture avoids a raw try exception, but the filesystem operation is still a
boundary. `@boundary` states its reason and guarantee; `@effects` lists exact observed
modules/APIs. Only when needed, add `@allow strict-fp/<check> -- reason` or `strict-fp/*`.
Neither bypasses boundary validation, length, cycle or commit checks. Unknown, duplicate,
unused and malformed declarations fail. Types, schemas, forwarding and ordinary
composition alone do not justify `.b.ts`.

The checker observes known platform effects and simple aliases. It cannot infer every
third-party implementation, reflection or callback effect, or prove a written reason
truthful. Configure effectful SDKs and review the guarantee.

### Additional helpers

| API             | Guarantee                                                                               |
| --------------- | --------------------------------------------------------------------------------------- |
| `isArray`       | readonly unknown array; does not validate elements                                      |
| `isObject`      | Non-null object, including arrays/Date/Map, excluding functions; not a dictionary claim |
| `isPlainObject` | Current-realm ordinary or null-prototype dictionary; values remain unknown              |
| `hasOwn`        | The checked own property exists; does not read getters or validate the payload          |
| `traverseAsync` | Sequential traversal, preserves order, stops invoking callbacks after the first Err     |

Guards return false for revoked/uninspectable proxies. A union key passed to hasOwn
does not prove that every union member exists. traverseAsync accepts synchronous and
async Results; thrown or rejected callback defects reject its Promise.

Existing map/flatMap/mapError, lazy recovery, collection helpers, branded types,
cleanup composition and real Decoder/Codec/JSON adapters remain available. There are
no new nullable aliases, throwing unwrap helpers or concurrency framework.

Function length ignores blank/comment-only lines and nested function bodies; braces
count. A justified exception immediately precedes its function:

```ts
// calm-allow-next-function function-length -- This dispatch mirrors one external format.
```

## Staging, development and publication

Use `check --staged` in your existing pre-commit hook and `commit-message --file "$1"`
in commit-msg. The full index, including config, is materialized in an owned temporary
directory. No stash, checkout, staging or working-tree writes occur. Partial staging,
rename/deletion and concurrent index changes are checked. Conflicted entries, tracked
symlinks and submodules are rejected explicitly. Installed dependencies are reused;
project source and configuration always come from the snapshot.

`checkProject` and `checkStaged` perform the complete static check. `checkSourceProject`
performs only custom source rules. `runChecks({files,imports}, config?)` is the pure
source-analysis API; provide a complete resolved edge list for files with imports.
Operational failures throw; code problems return diagnostics.

```sh
pnpm verify
pnpm test:package
# The maintainer performs only this final upload manually:
npm publish .local/release/ts-calm-0.1.0.tgz --access public
```

Windows/Linux CI tests source, compiler types, complete staged checking, and separate
npm/pnpm tarball consumers. Runtime imports never depend on the original game project.
Publication is manual; CI uploads verified tarballs without publishing to npm.
