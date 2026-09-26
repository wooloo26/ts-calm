/**
 * @boundary Expose the bundled native Oxfmt preset to project configuration and editors.
 * @effects node:fs
 * @allow strict-fp/no-assertion -- This maintained JSON is checked by Oxfmt itself during repository verification.
 */
import { readFileSync } from 'node:fs';

/**
 * The formatter options this preset sets.
 *
 * It is stated here rather than borrowed from Oxfmt so that installing `@ts-calm/check` never
 * installs a formatter. A project that runs Oxfmt can widen it through Oxfmt's own `defineConfig`.
 */
type OxfmtPreset = Readonly<{
  /** Whether string literals use single quotes. */
  singleQuote?: boolean;
  /** The line width the formatter wraps at. */
  printWidth?: number;
  /** Files the formatter leaves alone. */
  ignorePatterns?: readonly string[];
}>;

const config: unknown = JSON.parse(
  readFileSync(new URL('../presets/oxfmt.json', import.meta.url), 'utf8'),
);
export default config as OxfmtPreset;
