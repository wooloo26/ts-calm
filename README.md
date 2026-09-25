# fp-gates

Functional TypeScript primitives and five small architecture gates. MIT licensed.

[中文说明](README.zh-CN.md) · [Contributing](CONTRIBUTING.md)

## Install

Requires Node 24+ for the CLI. The functional entry is platform independent ESM.
Version 0.1.0 is prepared for publication; the npm install command becomes available
after the maintainer publishes it. Until then, install the tarball from a CI artifact.

```sh
npm install fp-gates
```

One package, three independent entry points:

- `fp-gates`: Result, Option, combinators, collection helpers, branded types and codecs.
- `fp-gates/boundary`: exception-to-Result adapters.
- `fp-gates/gates`: checking API, configuration and diagnostics; imports Node and OXC.

Importing the functional entry never loads the CLI, OXC, or Node-specific code. The
package installation includes the gate dependencies because this is a single package.

## Functional values

```ts
import { ok, err, map, match, fromNullable } from 'fp-gates';

const incremented = map(ok(3), (value) => value + 1);
const message = match(incremented, {
  ok: (value) => `value: ${value}`,
  err: () => 'unreachable',
});
const name = fromNullable(process.env.NAME);
const rejected = err({ code: 'missing-name' });
```

Containers are immutable and opaque. Use `isOk`, `isErr`, `isSome`, `isNone`, `get`
and `getError`; don't inspect their internal representation. `get` only accepts an
already-known successful/present variant. Constructors preserve literal inference.

The API includes `flatMap`, `mapError`, `andThrough`, lazy `getOrElse`/`orElse`,
`all`, `validateAll`, `traverse`, `filterMap`, `findMap`, `flatten`, `transpose`,
`inspect`, `inspectError`, `at`, `lookup`, `nonEmpty`, `branded`, and `isUniqueBy`.
`completeWithCleanup` preserves both operation and cleanup failures.
Public declarations describe overloads and their synchronous/async behavior.

```ts
import { captureAsync } from 'fp-gates/boundary';

const response = await captureAsync(() => fetch('https://example.com'), {
  name: 'fetch-example',
});
```

Unclassified failures become `Fault`; an optional classifier can distinguish expected
failures. Callback bugs in ordinary combinators are not silently swallowed.
`Decoder`/`Codec`, `decodeJson`/`encodeJson`, and explicit Option/Result DTO conversions
remain available for real external data. There is no schema-registration framework.

## Check a project

```sh
npx fp-gates check
npx fp-gates check --json
npx fp-gates check --staged
npx fp-gates commit-message --file .git/COMMIT_EDITMSG
```

All commands accept `--cwd <directory>`. Exit codes: 0 = passed (possibly warnings),
1 = rule errors, 2 = invalid configuration/arguments or operational failure.
JSON check output is an array of `{rule,file,line,column,severity,message}`.

All five rules are enabled by default:

| Rule              | Default                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `commit-message`  | `type(scope): description`, ASCII throughout, subject <= 100 characters   |
| `function-length` | Warn above 80 effective lines; error above 150                            |
| `boundary`        | Direct effects require a documented `.b.ts`; declarations must match code |
| `no-file-cycles`  | Reject value, type-only, re-export and literal dynamic-import cycles      |
| `strict-fp`       | Reject the explicitly listed syntax below; configurable per check         |

Supported sources: TypeScript ESM (`.ts`, `.tsx`, `.mts`, `.cts` files using ESM syntax).
Only `.b.ts` is a boundary suffix; JSX adapters should delegate effects to a `.b.ts`.
Dependencies, `dist`, `build`, `coverage`, `.git`, `.local`, and declaration files are
excluded. `test(s)`, `__tests__`, `fixture(s)`, `scripts` directories, `.test`/`.spec`
files and `.config` files skip boundary/strict-fp by default, but still participate
in length and cycle checks. Overrides can opt them in.

The graph uses package exports/imports and tsconfig paths, including local workspace
packages with exports. Install dependencies before checking. Unresolved imports,
excluded internal targets, parse failures, computed imports and CommonJS `require`
are reported rather than silently omitted. Dependency internals are not traversed.

## Configuration

Optional `gate.config.ts` exports a synchronous configuration object. It is trusted
project code executed by Node; top-level await is unsupported. No module manifests
or per-file JSON registries are needed.

```ts
import { defineConfig } from 'fp-gates/gates';

export default defineConfig({
  effectImports: ['better-sqlite3', 'some-network-sdk'],
  rules: {
    'commit-message': { scopes: ['root', 'app'], maxLength: 100, ascii: true },
    'function-length': { warning: 80, maximum: 150 },
    'strict-fp': { 'no-null': false },
  },
  overrides: [{ files: ['tests/**'], rules: { 'strict-fp': true } }],
});
```

Set a rule to `false` to disable it, including `strict-fp` as a whole. `files` and
`ignores` accept forward-slash `*`, `**`, `?` globs. `files` replaces the default
source patterns. `effectImports` lists exact import specifiers, not glob patterns.
Cycle configuration is project-wide; it cannot be disabled per file.

Strict checks: `no-throw`, `no-try`, `no-assertion`, `no-any`, `no-non-null`,
`no-null`, `no-undefined`, `no-class`, `no-this`, `no-with`, `no-var`, `no-delete`,
`no-module-state`. `as const`, local `let`, bounded loops, native JSON and pure
third-party imports are allowed. This is an explicit syntax policy, not a proof
of referential transparency or deep immutability.

## Boundaries that explain themselves

```ts
/**
 * @boundary Read external configuration and represent read failures as Result.
 * @effects node:fs/promises
 * @allow strict-fp/no-try -- Catch native filesystem exceptions at this adapter.
 */
import { readFile } from 'node:fs/promises';
import { ok, err } from 'fp-gates';

export const readConfiguration = async (path: string) => {
  try {
    return ok(await readFile(path, 'utf8'));
  } catch (cause) {
    return err(cause);
  }
};
```

Place one nonempty `@boundary` in leading comments before code (license comments and
shebangs are allowed). Describe why adaptation is necessary and what callers can rely on.
Repeat `@effects <exact module or API>` for observed direct effects. Builtins normalize
`fs` to `node:fs`; globals use names such as `fetch`, `process`, `console`, `Date.now`,
`Date` (current-time construction), `Math.random`, or `crypto.randomUUID`.

`@allow strict-fp/<check> -- reason` exempts that check throughout this file.
`@allow strict-fp/* -- reason` exempts all strict-fp checks. Neither exempts boundary
validation, length, cycles or commit messages. There are no effect wildcards.

Unused, duplicated, unknown or malformed declarations fail. Turning strict-fp off
does not make a still-used annotation stale. An adapter needs an implementation and
actual direct effects or syntax adaptation. Types, schema declarations, mere imports,
pure forwarding, or ordinary composition calling another boundary do not justify `.b.ts`.

```ts
// Wrong as pure.b.ts: adding a reason does not establish a real boundary.
/** @boundary A helper. */
export const double = (value: number) => value * 2;
```

The checker observes known platform APIs, imported bindings and simple aliases.
It cannot infer arbitrary third-party effects, indirect callbacks, reflection, or
whether a natural-language justification is truthful. Configure effectful SDKs and
review the reason. Ordinary orchestration may call adapters without becoming `.b.ts`.

Function length ignores blank/comment-only lines and nested function bodies; braces
count as code. A cohesive long function can have one immediately preceding comment:

```ts
// gate-allow-next-function function-length -- This dispatch follows one external format.
```

It must name the rule, include a reason, and still exceed the warning threshold.

## Hooks and staged checks

Use the CLI with your existing hook runner; the package installs no hooks automatically.
Pre-commit runs `fp-gates check --staged`; commit-msg runs
`fp-gates commit-message --file "$1"`.

Staged checking reads the entire index, including its config, into an owned temporary
directory. It never stashes, stages, rewrites, or checks out your files. It checks the
full graph, supports partial staging and rejects an index that changes mid-check.
Installed dependencies are reused; workspace sources and package metadata come from
the snapshot. Conflicted entries, tracked symlinks and submodules are rejected explicitly.

## API and development

`checkProject(root, config?)` and `checkStaged(root)` read projects and return diagnostics;
operational errors throw. `runGates({files, imports}, config?)` runs checks on source text.
For sources with imports, provide one `ResolvedImport` per import; the resolver edge
can be `project`, `external`, or `error`. `analyzeSources` exposes import offsets for
adapters. `validateCommitMessage(message, config?)` works without a repository.

```sh
pnpm verify
pnpm test:package
```

Windows and Linux CI validates source, types, gates, build and a separately installed
tarball consumer. Release artifacts live in `.local/release`; npm publishing is manual:

```sh
npm publish .local/release/fp-gates-0.1.0.tgz --access public
```

The tarball includes compiled JavaScript, declarations, READMEs, license and package
metadata. The functional library was extracted from the author's local-tx-one-piece
project; game/client materials and the original repository history are not included.
