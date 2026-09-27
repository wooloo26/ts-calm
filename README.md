# ts-calm

Private TypeScript workspace template. Node 24+, ESM; packages are not published.

- [fp](packages/fp/README.md): Option, Result, combinators, guards and codecs.
- [check](packages/check/README.md): source rules, pinned typechecking and CLI.

## Start

Copy the repository, update the root package name and commit scopes in
`ts-calm.config.ts`, then run:

```sh
pnpm install
pnpm exec lefthook install
pnpm verify
```

`pnpm verify` runs build, typechecking, source checks, lint, formatting checks, tests and
built-CLI smoke tests. Use `pnpm test:coverage` for coverage and `pnpm bench` for benchmarks.
Other commands are in [package.json](package.json).

Keep pure logic in `.ts` and direct host operations in documented `.b.ts` adapters.
See [rules](docs/rules.md) and [necessary allowances](docs/allow.md).
Edit rule help in `packages/check/src/rules/help.ts`, then run `pnpm run docs` to regenerate
the rule guide. Commit subjects use `scope - description`, in ASCII, at most 100 characters.
