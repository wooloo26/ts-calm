export type RuleHelp = Readonly<{ summary: string; example: string }>;
export const ruleHelpEntries: Readonly<Record<string, RuleHelp>> = {
  purity: {
    summary:
      'Production functions follow a pure-by-default convention. Declare known I/O, time, randomness or external state effects with a leading @impure reason. Local construction and loops are allowed; project calls propagate known effects, while private temporary mutations stay local. Higher-order helpers depend on their callbacks. This bounded analysis does not prove unknown third-party calls, getters, proxies or dynamic dispatch pure. The annotation never bypasses boundary or other checks.',
    example:
      '/** @impure Read the system clock. */\nexport const now = () => Date.now();\n// Direct host operations also require a documented .b.ts boundary.',
  },
  'strict-fp/no-try': {
    summary:
      'Prefer capture/captureAsync around the external operation. If it already returns Result, use captureResult/captureResultAsync. Keep real I/O in .b.ts. Do not mechanically rewrite try/finally cleanup.',
    example:
      "import { captureAsync } from '@ts-calm/fp/boundary';\nconst result = await captureAsync(() => readFile(path, 'utf8'), { name: 'read-config' });",
  },
  'strict-fp/no-null': {
    summary:
      "For absence use fromNullable/isNonNullable, then match, getOrElse or toResult. This preserves 0, false and ''. A protocol's real null value is different: keep its explicit boundary representation.",
    example:
      "import { fromNullable, getOrElse } from '@ts-calm/fp';\nconst name = getOrElse(fromNullable(externalName), () => 'anonymous');",
  },
  'strict-fp/no-undefined': {
    summary:
      'Convert external absence with fromNullable. Use at/lookup for possibly missing collection entries. Do not confuse an explicit stored value with an absent key.',
    example:
      "import { lookup, match } from '@ts-calm/fp';\nconst label = match(lookup(record, 'name'), { some: value => String(value), none: () => 'missing' });",
  },
  'strict-fp/no-any': {
    summary:
      'Use unknown with isArray/isObject/isPlainObject/hasOwn, or a Decoder. A guard only proves its stated shape; property values still need checking.',
    example:
      "import { hasOwn } from '@ts-calm/fp';\nconst hasName = (value: unknown) => hasOwn(value, 'name') && typeof value.name === 'string';",
  },
  'strict-fp/no-assertion': {
    summary:
      'Prefer narrowing guards or a Decoder. Use branded only after validation. A necessary correlation assertion belongs in a narrowly documented adapter; as const is allowed.',
    example:
      "import { isArray } from '@ts-calm/fp';\nconst count = (value: unknown) => isArray(value) ? value.length : 0;",
  },
  'strict-fp/no-non-null': {
    summary:
      'Use at/lookup and handle Option with match/getOrElse. get accepts only a known Ok/Some variant, not a possibly absent container.',
    example:
      "import { at, getOrElse } from '@ts-calm/fp';\nconst first = getOrElse(at(values, 0), () => fallback);",
  },
  'strict-fp/no-throw': {
    summary:
      'Return err for expected failures. Convert dependency exceptions with capture at the point where they enter your program.',
    example: "import { err } from '@ts-calm/fp';\nconst rejected = err({ code: 'invalid-input' });",
  },
  'strict-fp/no-class': {
    summary:
      'Represent data with readonly values and behavior with functions. Document unavoidable external class adaptation in .b.ts.',
    example: 'type Point = Readonly<{ x: number; y: number }>;',
  },
  'strict-fp/no-this': {
    summary: 'Pass dependencies and state explicitly instead of relying on an implicit receiver.',
    example: 'const total = (value: Readonly<{ amount: number }>) => value.amount;',
  },
  'strict-fp/no-with': {
    summary: 'Use explicit property access so names and dependencies remain visible.',
    example: 'const name = value.name;',
  },
  'strict-fp/no-var': {
    summary: 'Use const; local let and ordinary loops are supported.',
    example: 'const value = calculate();',
  },
  'strict-fp/no-delete': {
    summary: 'Construct a new value without the removed property instead of mutating shared input.',
    example: 'const { removed, ...remaining } = input;',
  },
  'strict-fp/no-module-state': {
    summary: 'Pass state explicitly or create it inside the operation that owns its lifetime.',
    example: 'const createState = () => ({ count: 0 });',
  },
  'no-file-cycles': {
    summary:
      'Break file dependency cycles, including type-only edges; move genuinely shared definitions to an independent leaf.',
    example: 'a.ts -> shared.ts <- b.ts',
  },
  'no-module-cycles': {
    summary:
      'Each source directory is a module. A directory cycle can exist without any individual file cycle; inspect the reported witness imports.',
    example: 'orders/read.ts -> stock/types.ts\nstock/write.ts -> orders/types.ts',
  },
  boundary: {
    summary:
      'Only direct effects or concrete adaptation justify .b.ts. Adaptation covers bridging an external shape and bridging a type relationship the compiler cannot express, such as correlated overloads. Explain the guarantee with @boundary, declare actual @effects, and prefer functional helpers before adding @allow.',
    example:
      '/**\n * @boundary Read configuration as an explicit Result.\n * @effects node:fs/promises\n */',
  },
  'function-length': {
    summary:
      'Split by responsibility above 80 effective lines; above 150 is an error. Only the lines inside a function body count: comments, blank lines and nested function bodies are excluded, and the declaration braces are not lines. A necessary local exception must remain used and state its reason.',
    example:
      '// calm-allow-next-function function-length -- This dispatch mirrors one external format.',
  },
  'commit-message': {
    summary:
      'Use scope - verb description, ASCII throughout, with a subject no longer than 100 characters.',
    example: 'fp - add add safe guards',
  },
};

export const helpForRule = (rule: string): RuleHelp | false => ruleHelpEntries[rule] ?? false;
export const documentationFor = (rule: string): string =>
  `https://github.com/wooloo26/ts-calm/blob/main/docs/rules.md#${rule.replaceAll('/', '-')}`;

export const renderRuleGuide = (): string => {
  const sections = Object.entries(ruleHelpEntries).map(
    ([rule, help]) =>
      `## ${rule.replaceAll('/', '-')}\n\n${help.summary}\n\n\`\`\`ts\n${help.example}\n\`\`\`\n`,
  );
  return `<!-- Generated by packages/check/scripts/docs.ts from packages/check/src/rule-help.ts. -->\n\n# Rule guide\n\n${sections.join('\n')}`;
};

export const explainRule = (rule: string): string => {
  const help = helpForRule(rule);
  return help ? `${rule}\n\n${help.summary}\n\n${help.example}\n\n${documentationFor(rule)}` : '';
};
