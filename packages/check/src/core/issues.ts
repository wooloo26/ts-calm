import { get, isSome } from '@ts-calm/fp';
import type { CompletionIssue } from '@ts-calm/fp';
import type { Fault } from '@ts-calm/fp/boundary';

/** A failed check operation, distinct from a source-rule diagnostic. */
export type CheckIssue = Readonly<{
  code:
    | 'invalid-config'
    | 'invalid-manifest'
    | 'invalid-snapshot'
    | 'command-failed'
    | 'invalid-arguments';
  operation: string;
  message: string;
}>;
/** Cleanup failures retain the original failure, including failures from nested operations. */
export interface CheckCleanup extends CompletionIssue<CheckFailure, Fault> {}
export type CheckFailure = CheckIssue | Fault | CheckCleanup;

export const issue = (
  code: CheckIssue['code'],
  operation: string,
  message: string,
): CheckIssue => ({ code, operation, message });

export const failureMessage = (failure: CheckFailure): string => {
  if (failure.code !== 'cleanup-failed') return failure.message;
  const primary = isSome(failure.operationError)
    ? `${failureMessage(get(failure.operationError))}\n`
    : '';
  return (
    primary +
    failure.cleanupErrors.map((error) => `Cleanup ${error.operation}: ${error.message}`).join('\n')
  );
};
