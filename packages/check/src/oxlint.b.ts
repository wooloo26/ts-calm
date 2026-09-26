/**
 * @boundary Expose the bundled native Oxlint preset to project configuration and editors.
 * @effects node:fs
 * @allow strict-fp/no-assertion -- This maintained JSON is checked by Oxlint itself during repository verification.
 */
import { readFileSync } from 'node:fs';

/**
 * The linter configuration this preset sets.
 *
 * It is stated here rather than borrowed from Oxlint so that installing `@ts-calm/check` never
 * installs a linter. A project that runs Oxlint can widen it through Oxlint's own `defineConfig`.
 */
type OxlintPreset = Readonly<{
  /** The plugins whose rules are enabled. */
  plugins?: readonly string[];
  /** Category-level settings. */
  categories?: Readonly<Record<string, string>>;
  /** Individual rule settings. */
  rules?: Readonly<Record<string, string>>;
  /** Paths the linter leaves alone. */
  ignorePatterns?: readonly string[];
}>;

const config: unknown = JSON.parse(
  readFileSync(new URL('../presets/oxlint.json', import.meta.url), 'utf8'),
);
export default config as OxlintPreset;
