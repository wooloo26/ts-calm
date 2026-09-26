export { defineConfig } from '#src/configuration';
export { runChecks, analyzeSources } from '#src/engine';
export { checkProject } from '#src/project';
export { checkSourceProject } from '#src/sources.b';
export { formatProject, lintProject, typecheckProject } from '#src/tools.b';
export { checkStaged, checkStagedMessage, withStagedProject } from '#src/staged.b';
export { validateCommitMessage } from '#src/commit-message';
export { formatDiagnostics } from '#src/diagnostics';
export { initializeProject } from '#src/init.b';
export { explainRule } from '#src/rule-help';
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
} from '#src/types';
