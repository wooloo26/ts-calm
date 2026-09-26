import { mkdirSync, writeFileSync } from 'node:fs';
import { renderRuleGuide } from '../src/rule-help.ts';

mkdirSync(new URL('../../../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../../docs/rules.md', import.meta.url), renderRuleGuide());
