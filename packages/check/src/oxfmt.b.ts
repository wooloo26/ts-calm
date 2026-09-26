/**
 * @boundary Expose the bundled native Oxfmt preset to project configuration and editors.
 * @effects node:fs
 * @allow strict-fp/no-assertion -- This maintained JSON is checked by Oxfmt itself during repository verification.
 */
import { readFileSync } from 'node:fs';

type OxfmtPreset = Readonly<{
  singleQuote?: boolean;
  printWidth?: number;
  ignorePatterns?: readonly string[];
}>;

const config: unknown = JSON.parse(
  readFileSync(new URL('../presets/oxfmt.json', import.meta.url), 'utf8'),
);
export default config as OxfmtPreset;
