export type RuleName =
  | 'commit-message'
  | 'function-length'
  | 'boundary'
  | 'no-file-cycles'
  | 'strict-fp';

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
export type StrictCheck = (typeof strictChecks)[number];
export type Diagnostic = Readonly<{
  rule: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}>;
export type SourceFile = Readonly<{ path: string; content: string }>;
export type GateConfiguration = Readonly<{
  files?: readonly string[];
  ignores?: readonly string[];
  effectImports?: readonly string[];
  rules?: Readonly<{
    'commit-message'?:
      | boolean
      | Readonly<{ scopes?: readonly string[]; maxLength?: number; ascii?: boolean }>;
    'function-length'?: boolean | Readonly<{ warning?: number; maximum?: number }>;
    boundary?: boolean;
    'no-file-cycles'?: boolean;
    'strict-fp'?: boolean | Readonly<Partial<Record<StrictCheck, boolean>>>;
  }>;
  overrides?: readonly Readonly<{
    files: readonly string[];
    rules: Readonly<
      Partial<Record<Exclude<RuleName, 'commit-message' | 'no-file-cycles'>, boolean>>
    >;
  }>[];
}>;
export type SourceComment = Readonly<{ text: string; start: number; end: number }>;
export type FunctionFact = Readonly<{
  name: string;
  start: number;
  bodyStart: number;
  bodyEnd: number;
}>;
export type ImportFact = Readonly<{ specifier: string; offset: number; typeOnly: boolean }>;
export type Fact = Readonly<{ name: string; offset: number }>;
export type ParsedSource = Readonly<{
  comments: readonly SourceComment[];
  functions: readonly FunctionFact[];
  imports: readonly ImportFact[];
  strict: readonly Fact[];
  effects: readonly Fact[];
  issues: readonly Fact[];
  hasImplementation: boolean;
}>;
export type AnalyzedFile = Readonly<{ source: SourceFile; parsed: ParsedSource }>;
export type ImportResolution = Readonly<
  { kind: 'project'; path: string } | { kind: 'external' } | { kind: 'error'; message: string }
>;
export type ResolvedImport = Readonly<{
  file: string;
  imported: ImportFact;
  target: ImportResolution;
}>;
export type GateInput = Readonly<{
  files: readonly SourceFile[];
  imports?: readonly ResolvedImport[];
}>;
