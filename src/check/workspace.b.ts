/**
 * @boundary Render a complete workspace into an empty directory without installing dependencies or starting tools.
 * @effects node:fs
 * @allow strict-fp/no-throw -- Refuse conflicts and invalid bundled metadata before writing project files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { format } from 'oxfmt';
import { isPlainObject } from '#fp/guards';
import { workspaceTemplate } from '#check/workspace-template';
import type { InitResult } from '#check/init.b';

/** @impure Inspect the destination and create only this template's files after complete conflict checking. */
export const initializeWorkspace = async (directory: string): Promise<InitResult> => {
  const root = resolve(directory);
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination must be absent or empty.');
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  if (
    !isPlainObject(manifest) ||
    typeof manifest['version'] !== 'string' ||
    !isPlainObject(manifest['dependencies']) ||
    typeof manifest['dependencies']['typescript'] !== 'string'
  )
    throw new Error('Invalid bundled package metadata.');
  const files = workspaceTemplate(manifest['version'], manifest['dependencies']['typescript']);
  const rendered: Readonly<{ path: string; content: string }>[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path === '.gitignore') {
      rendered.push({ path, content });
      continue;
    }
    const result = await format(path, content, { singleQuote: true, printWidth: 100 });
    if (result.errors.length) throw new Error(`Cannot format template ${path}.`);
    rendered.push({ path, content: result.code });
  }
  if (existsSync(root) && readdirSync(root).length > 0)
    throw new Error('The workspace destination changed; expected an empty directory.');
  mkdirSync(root, { recursive: true });
  for (const file of rendered) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content, { flag: 'wx' });
  }
  return { created: rendered.map((file) => file.path), updated: [], warnings: [] };
};
