export { defineConfig } from './configuration.ts';
export { runChecks, analyzeSources } from './engine.ts';
export { checkProject, checkLint } from './project.ts';
export { checkSourceProject } from './sources.b.ts';
export { formatProject, typecheckProject } from './tools.b.ts';
export { checkStaged } from './staged.b.ts';
export { validateCommitMessage } from './commit-message.ts';
export { formatDiagnostics } from './diagnostics.ts';
export { initializeProject } from './init.b.ts';
export { explainRule } from './rule-help.ts';
export type {
  Diagnostic,
  CheckConfig,
  CheckInput,
  RuleName,
  SourceFile,
  StrictCheck,
  ResolvedImport,
  ImportResolution,
  ImportFact,
} from './types.ts';
