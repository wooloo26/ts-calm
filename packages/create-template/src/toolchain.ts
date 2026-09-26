/**
 * The versions a generated workspace is pinned to.
 *
 * They are data rather than a lookup of the installed graph: a published generator must render a
 * workspace without the toolchain present, which is exactly what `pnpm dlx` provides. A test in
 * this package fails when any value here drifts from the manifest that owns it.
 */
export type ToolchainVersions = Readonly<{
  /** The `@ts-calm/fp` version written into a generated manifest. */
  fp: string;
  /** The `@ts-calm/check` version written into a generated manifest. */
  check: string;
  /** The compiled TypeScript toolchain, which `@ts-calm/check` also pins. */
  typescript: string;
  /** The formatter, which `@ts-calm/check` also pins. */
  oxfmt: string;
  /** The linter, which `@ts-calm/check` also pins. */
  oxlint: string;
  /** The type-aware linter backend, which `@ts-calm/check` also pins. */
  oxlintTsgolint: string;
  /** The task runner the generated pipeline uses. */
  turbo: string;
  /** The test runner the generated packages use. */
  vitest: string;
}>;

/** The versions every generated workspace is pinned to. */
export const toolchainVersions: ToolchainVersions = Object.freeze({
  fp: '0.1.0',
  check: '0.1.0',
  typescript: '7.0.2',
  oxfmt: '0.68.0',
  oxlint: '1.83.0',
  oxlintTsgolint: '7.0.2002',
  turbo: '2.11.4',
  vitest: '5.0.1',
});

/** The package manager a generated workspace declares. */
export const packageManagerVersion = 'pnpm@11.22.0';
