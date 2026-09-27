export { defineConfig } from '#src/core/configuration';
export { runChecks, analyzeSources } from '#src/engine';
export { checkProject, checkSourceProject } from '#src/project';
export { typecheckProject } from '#src/typecheck.b';
export { checkStaged, checkStagedMessage, withStagedProject } from '#src/staged.b';
export { validateCommitMessage } from '#src/rules/commit-message';
export { formatDiagnostics } from '#src/core/diagnostics';
export { initializeProject } from '#src/init.b';
export { explainRule } from '#src/rules/help';
export { loadConfiguration } from '#src/config-reader.b';
export { validateConfiguration } from '#src/configuration';
export { failureMessage } from '#src/core/issues';
export type { CheckIssue, CheckFailure, CheckCleanup } from '#src/core/issues';
export type { InitResult } from '#src/manifest';
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
} from '#src/core/types';
