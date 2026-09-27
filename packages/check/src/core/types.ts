/** The rule names a project can enable, disable or override. */
export type RuleName =
  | 'commit-message'
  | 'function-length'
  | 'function-params'
  | 'boundary'
  | 'no-file-cycles'
  | 'no-module-cycles'
  | 'strict-fp'
  | 'purity';

export const strictChecks = [
  'no-throw',
  'no-try',
  'no-assertion',
  'no-any',
  'no-non-null',
  'no-null',
  'no-undefined',
  'no-class',
  'no-this',
  'no-with',
  'no-var',
  'no-delete',
  'no-module-state',
] as const;
/** One `strict-fp` sub-check name. */
export type StrictCheck = (typeof strictChecks)[number];
/**
 * One reported problem, always located at a project-relative path.
 *
 * `help` and `docs` are present only when the rule can point at a fix or a guide section.
 */
export type Diagnostic = Readonly<{
  /** The reporting rule, such as `strict-fp/no-null` or `boundary/undeclared`. */
  rule: string;
  /** Project-relative path with forward slashes. */
  file: string;
  /** One-based line number. */
  line: number;
  /** One-based column number. */
  column: number;
  /** `error` fails the check; `warning` is reported without failing. */
  severity: 'error' | 'warning';
  /** The problem, in one actionable sentence. */
  message: string;
  /** How to resolve it, when the rule knows a concrete alternative. */
  help?: string;
  /** Link to the published rule guide. */
  docs?: string;
}>;
/** One source file handed to the analysis, with the path used in diagnostics. */
export type SourceFile = Readonly<{ path: string; content: string }>;
/**
 * Project check configuration, loaded from `ts-calm.config.ts` or passed directly.
 *
 * Every field is optional; an absent rule is enabled unless it is project-wide. `overrides`
 * apply last, so the final rule state for a file is the override's value when the file matches.
 */
export type CheckConfig = Readonly<{
  /**
   * Include globs; defaults to every TypeScript extension when omitted.
   *
   * Patterns support `*`, `**` and `?` only, against project-relative forward-slash paths.
   * Brace expansion, character classes and `!` negation are not supported.
   */
  files?: readonly string[];
  /** Additional exclude globs with the same subset, applied after the built-in directory exclusions. */
  ignores?: readonly string[];
  /** Import specifiers treated as effects by the purity rule, such as `oxc-resolver`. */
  effectImports?: readonly string[];
  /** Per-rule settings; `false` disables a rule for the whole project. */
  rules?: Readonly<{
    'commit-message'?:
      | boolean
      | Readonly<{ scopes?: readonly string[]; maxLength?: number; ascii?: boolean }>;
    'function-length'?: boolean | Readonly<{ warning?: number; maximum?: number }>;
    /** Limit every callable signature to three parameters. */
    'function-params'?: boolean;
    boundary?: boolean;
    'no-file-cycles'?: boolean;
    'no-module-cycles'?: boolean;
    'strict-fp'?: boolean | Readonly<Partial<Record<StrictCheck, boolean>>>;
    purity?: boolean;
  }>;
  /** Per-file rule changes; `commit-message`, `no-file-cycles` and `no-module-cycles` stay project-wide. */
  overrides?: readonly Readonly<{
    files: readonly string[];
    rules: Readonly<
      Partial<
        Record<Exclude<RuleName, 'commit-message' | 'no-file-cycles' | 'no-module-cycles'>, boolean>
      >
    >;
  }>[];
}>;
export type SourceComment = Readonly<{ text: string; start: number; end: number }>;
export type FunctionFact = Readonly<{
  name: string;
  start: number;
  bodyStart: number;
  bodyEnd: number;
  bodyBlock: boolean;
}>;
/** One import or re-export, including type-only forms. */
export type ImportFact = Readonly<{ specifier: string; offset: number; typeOnly: boolean }>;
export type Fact = Readonly<{ name: string; offset: number }>;
export type SignatureFact = Readonly<{ offset: number; parameters: number }>;
export type ParsedSource = Readonly<{
  ast?: unknown;
  comments: readonly SourceComment[];
  functions: readonly FunctionFact[];
  signatures: readonly SignatureFact[];
  imports: readonly ImportFact[];
  strict: readonly Fact[];
  effects: readonly Fact[];
  issues: readonly Fact[];
  hasImplementation: boolean;
}>;
export type AnalyzedFile = Readonly<{ source: SourceFile; parsed: ParsedSource }>;
/**
 * Where one import points: a checked project file, an installed dependency, or a resolution
 * failure that the rules report instead of ignoring.
 */
export type ImportResolution = Readonly<
  { kind: 'project'; path: string } | { kind: 'external' } | { kind: 'error'; message: string }
>;
/** One import resolved against the inspected filesystem, ready for the cycle and boundary rules. */
export type ResolvedImport = Readonly<{
  file: string;
  imported: ImportFact;
  target: ImportResolution;
}>;
/** The analyzed files and resolved imports handed to the rule engine. */
export type CheckInput = Readonly<{
  files: readonly SourceFile[];
  imports?: readonly ResolvedImport[];
}>;
