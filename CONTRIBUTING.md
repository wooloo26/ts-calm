# Contributing

Use Node 24+ and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test -- tests/check/rules.ts
pnpm verify
pnpm test:package
```

Keep behavior checks pure and external operations in small, documented `.b.ts` adapters.
Run `pnpm docs` after updating `src/check/rule-help.ts`; the generated rule guide is not edited by hand.
Use `pnpm check` for the complete static check. Tool integration resolves its own pinned dependencies.
The boundary comment states both why the adaptation exists and what callers can rely on.
Do not add manifests, generated role registries, or new rules for a single project's conventions.
Directories are modules, including nested and test directories. Avoid both file and directory cycles.
Add a regression test for observable behavior; preserve the functional API's type inference.

Commit messages use `type(scope): description`, ASCII only, up to 100 characters in the
subject. This repository accepts `root`, `fp`, `check`, `docs`, and `build` scopes.

The test fixtures own their temporary directories and Git repositories. Never operate
on a contributor's worktree/index from a test. Generated release artifacts stay in `.local`.

CI checks Windows and Linux. It does not publish to npm.
