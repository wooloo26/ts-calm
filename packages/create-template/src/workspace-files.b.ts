/**
 * @boundary Read the repository files a generated workspace is built from.
 * @effects node:fs
 * @allow strict-fp/no-throw -- A missing or invalid repository file must fail generation instead of writing a partial workspace.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * One file this repository hands to a generated workspace.
 *
 * `path` is the repository-relative name, also the name written into a generated workspace, while
 * `shipped` is the plain name the build copies into `dist/template-files` for the published package.
 */
export type WorkspaceRootFile = Readonly<{ path: string; shipped: string }>;

/** Every repository file a generated workspace draws from, in repository order. */
export const workspaceRootFileTable: readonly WorkspaceRootFile[] = [
  { path: '.editorconfig', shipped: 'editorconfig' },
  { path: '.gitattributes', shipped: 'gitattributes' },
  { path: '.gitignore', shipped: 'gitignore' },
  { path: '.node-version', shipped: 'node-version' },
  { path: '.oxfmtrc.json', shipped: 'oxfmtrc.json' },
  { path: '.oxlintrc.json', shipped: 'oxlintrc.json' },
  { path: 'lefthook.yml', shipped: 'lefthook.yml' },
  { path: 'package.json', shipped: 'manifest.json' },
  { path: 'pnpm-workspace.yaml', shipped: 'pnpm-workspace.yaml' },
  { path: 'tsconfig.json', shipped: 'tsconfig.json' },
  { path: 'turbo.json', shipped: 'turbo.json' },
  { path: 'vitest.config.ts', shipped: 'vitest.config.ts' },
];

/**
 * Read one repository file, preferring this checkout over the copy shipped with the package.
 *
 * Running from this repository (source or built) resolves the repository root three levels up;
 * an installed copy falls back to `dist/template-files`, which the package build refreshes.
 *
 * @impure Reads a repository file from disk.
 */
const read = (name: string, shipped: string): string => {
  const candidates = [
    new URL(`../../../${name}`, import.meta.url),
    new URL(`./template-files/${shipped}`, import.meta.url),
  ];
  for (const candidate of candidates)
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  throw new Error(`Missing workspace file ${name} in this repository or in the installed package.`);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && Boolean(value) && !Array.isArray(value);

const strings = (value: unknown): Readonly<Record<string, string>> => {
  if (!isRecord(value)) return {};
  const entries: Record<string, string> = {};
  for (const [name, entry] of Object.entries(value))
    if (typeof entry === 'string') entries[name] = entry;
  return entries;
};

/**
 * Read every file a generated workspace renders verbatim, except its derived manifest.
 *
 * @impure Reads this repository's workspace files, or the copies shipped with the package.
 */
const readRootFiles = (): Readonly<Record<string, string>> => {
  const entries: Record<string, string> = {};
  for (const file of workspaceRootFileTable)
    if (file.path !== 'package.json') entries[file.path] = read(file.path, file.shipped);
  return entries;
};

/**
 * Parse this repository's manifest, which every generated manifest is derived from.
 *
 * @impure Reads this repository's manifest, or the copy shipped with the package.
 */
const readRootManifest = (): Readonly<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(read('package.json', 'manifest.json'));
  if (!isRecord(parsed)) throw new Error('The repository package.json must contain an object.');
  return parsed;
};

/** Every repository file a generated workspace draws from. */
export const workspaceRootFileNames: readonly string[] = workspaceRootFileTable
  .map((file) => file.path)
  .toSorted();

/**
 * The repository files a generated workspace renders verbatim, keyed by generated path.
 *
 * `package.json` is absent on purpose: the generated manifest is derived from
 * {@link workspaceRootManifest} instead of being copied.
 */
export const workspaceRootFiles: Readonly<Record<string, string>> = Object.freeze(readRootFiles());

/** The repository manifest every generated manifest derives its shape and versions from. */
export const workspaceRootManifest: Readonly<Record<string, unknown>> = readRootManifest();

/** The repository scripts a generated workspace inherits, with repository-only entries included. */
export const workspaceRootScripts: Readonly<Record<string, string>> = strings(
  workspaceRootManifest['scripts'],
);

/** The repository development dependencies a generated workspace inherits. */
export const workspaceRootDevDependencies: Readonly<Record<string, string>> = strings(
  workspaceRootManifest['devDependencies'],
);
