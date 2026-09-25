export { defineConfig } from '#check/configuration';
export { runChecks, analyzeSources } from '#check/engine';
export { checkProject, checkLint } from '#check/project';
export { checkSourceProject } from '#check/sources.b';
export { formatProject, typecheckProject } from '#check/tools.b';
export { checkStaged } from '#check/staged.b';
export { validateCommitMessage } from '#check/commit-message';
export { formatDiagnostics } from '#check/diagnostics';
export { initializeProject } from '#check/init.b';
export { initializeWorkspace } from '#check/workspace.b';
export { explainRule } from '#check/rule-help';
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
} from '#check/types';
