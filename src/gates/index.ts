export { defineConfig } from './configuration.ts';
export { runGates, analyzeSources } from './engine.ts';
export { checkProject } from './project.b.ts';
export { checkStaged } from './staged.b.ts';
export { validateCommitMessage } from './commit-message.ts';
export { formatDiagnostics } from './diagnostics.ts';
export type {
  Diagnostic,
  GateConfiguration,
  GateInput,
  RuleName,
  SourceFile,
  StrictCheck,
  ResolvedImport,
  ImportResolution,
  ImportFact,
} from './types.ts';
