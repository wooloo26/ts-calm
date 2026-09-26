export { defineConfig } from '#src/core/configuration';
export { runChecks, analyzeSources } from '#src/engine';
export { checkProject } from '#src/project';
export { checkSourceProject } from '#src/sources.b';
export { typecheckProject } from '#src/typecheck.b';
export { checkStaged, checkStagedMessage, withStagedProject } from '#src/staged.b';
export { validateCommitMessage } from '#src/rules/commit-message';
export { formatDiagnostics } from '#src/core/diagnostics';
export { initializeProject } from '#src/init.b';
export { explainRule } from '#src/rules/help';
export { loadConfiguration, validateConfiguration } from '#src/config-reader.b';
export type { InitResult } from '#src/init.b';
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
