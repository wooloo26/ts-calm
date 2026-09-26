/**
 * @boundary Expose the bundled native Oxlint preset to project configuration and editors.
 * @effects node:fs
 * @allow strict-fp/no-assertion -- This maintained JSON is checked by Oxlint itself during repository verification.
 */
import { readFileSync } from 'node:fs';

type OxlintPreset = Readonly<{
  plugins?: readonly string[];
  categories?: Readonly<Record<string, string>>;
  rules?: Readonly<Record<string, string>>;
  ignorePatterns?: readonly string[];
}>;

const config: unknown = JSON.parse(
  readFileSync(new URL('../presets/oxlint.json', import.meta.url), 'utf8'),
);
export default config as OxlintPreset;
