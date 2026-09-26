/**
 * @boundary Expose the bundled native Oxfmt preset to project configuration and editors.
 * @effects node:fs
 * @allow strict-fp/no-assertion -- This maintained JSON is checked by Oxfmt itself during repository verification.
 */
import { readFileSync } from 'node:fs';
import type { OxfmtConfig } from 'oxfmt';

const config: unknown = JSON.parse(
  readFileSync(new URL('../presets/oxfmt.json', import.meta.url), 'utf8'),
);
export default config as OxfmtConfig;
