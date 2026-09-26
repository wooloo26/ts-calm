export type ToolchainVersions = Readonly<{
  fp: string;
  check: string;
  typescript: string;
  oxfmt: string;
  oxlint: string;
  oxlintTsgolint: string;
  turbo: string;
  vitest: string;
}>;

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

export const packageManagerVersion = 'pnpm@11.22.0';
