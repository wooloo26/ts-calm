import type { GateConfiguration, RuleName } from './types.ts';

export const defineConfig = (config: GateConfiguration): GateConfiguration => config;

/** Small path glob matcher: *, **, and ?; always use forward slashes. */
export const matches = (path: string, pattern: string): boolean => {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? '';
    if (char === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        expression += '(?:.*/)?';
        index += 1;
      } else expression += '.*';
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
  }
  return new RegExp(`${expression}$`).test(path.replaceAll('\\', '/'));
};

export const excluded = (path: string, config: GateConfiguration): boolean =>
  /(?:^|\/)(?:node_modules|dist|build|coverage|\.git|\.local)(?:\/|$)/.test(path) ||
  /\.d\.[cm]?ts$/.test(path) ||
  (config.ignores ?? []).some((pattern) => matches(path, pattern));

export const selected = (path: string, config: GateConfiguration): boolean =>
  /\.[cm]?tsx?$/.test(path) &&
  !excluded(path, config) &&
  (config.files ?? ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']).some((pattern) =>
    matches(path, pattern),
  );

const supportFile = (path: string): boolean =>
  /(?:^|\/)(?:tests?|__tests__|fixtures?|scripts)(?:\/|$)/.test(path) ||
  /(?:\.(?:test|spec|config)\.[cm]?tsx?$|(?:^|\/)gate\.config\.ts$)/.test(path);

export const enabled = (rule: RuleName, path: string, config: GateConfiguration): boolean => {
  let active = config.rules?.[rule] !== false;
  if ((rule === 'boundary' || rule === 'strict-fp') && supportFile(path)) active = false;
  for (const override of config.overrides ?? [])
    if (override.files.some((pattern) => matches(path, pattern)) && rule in override.rules)
      active = Object.entries(override.rules).find(([name]) => name === rule)?.[1] !== false;
  return active;
};
