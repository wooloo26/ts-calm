/**
 * @boundary Convert dependency exceptions and classifier defects into explicit Result failures.
 */
import { err, get, isErr, isSome, none, ok } from './containers.ts';
import type { AsyncResult, Option, Result } from './containers.ts';
import type { Synchronous } from './contracts.ts';

/** An unclassified exception, reported instead of being hidden by `capture`. */
export type Fault = Readonly<{
  /** Marks this failure as an unclassified fault rather than a domain problem. */
  code: 'unexpected-fault';
  /** The operation name from {@link CaptureOptions}, or `<name>.classify` for a failing classifier. */
  operation: string;
  /** The exception message, or a description when the cause was not an `Error`. */
  message: string;
  /** The original thrown value; it is kept for diagnostics and never inspected by the library. */
  cause: unknown;
}>;
/** How {@link capture} names the operation and optionally classifies its exception. */
export type CaptureOptions<Problem> = Readonly<{
  /** The operation name reported on an unclassified fault. */
  name: string;
  /** Maps an exception to a domain problem; returning `none()` keeps it as a {@link Fault}. */
  classify?: (cause: unknown) => Option<Problem>;
}>;

const faultMessage = (cause: unknown): string => {
  // @allow strict-fp/no-try -- Implement capture itself and its failure inspection; using capture here would recurse.
  try {
    if (cause instanceof Error) return cause.message;
    return typeof cause === 'string' ? cause : 'Unexpected non-Error failure';
  } catch {
    return 'Uninspectable failure';
  }
};
const unexpected = (operation: string, cause: unknown): Fault => ({
  code: 'unexpected-fault',
  operation,
  message: faultMessage(cause),
  cause,
});
const classifyFailure = <Problem>(
  cause: unknown,
  options: CaptureOptions<Problem>,
): Result<never, Problem | Fault> => {
  // @allow strict-fp/no-try -- Implement capture itself and its failure inspection; using capture here would recurse.
  try {
    const classified = options.classify ? options.classify(cause) : none();
    return isSome(classified) ? err(get(classified)) : err(unexpected(options.name, cause));
  } catch (classificationCause) {
    return err(unexpected(`${options.name}.classify`, classificationCause));
  }
};

/**
 * Replace a try/catch around one external operation with `Result`.
 *
 * @param operation - The external call, invoked immediately; keep real I/O in a `.b.ts` boundary.
 * @param options - Names the operation and optionally classifies the exception.
 * @returns `Ok` with the result, or `Err` with the classified problem or a {@link Fault}.
 * @see https://github.com/wooloo26/ts-calm/blob/main/docs/rules.md#strict-fp-no-try
 */
export const capture = <Value = never, Problem = never>(
  operation: () => Synchronous<Value>,
  options: CaptureOptions<Problem>,
): Result<Value, Problem | Fault> => {
  // @allow strict-fp/no-try -- Implement capture itself and its failure inspection; using capture here would recurse.
  try {
    return ok(operation());
  } catch (cause) {
    return classifyFailure(cause, options);
  }
};

/**
 * Capture both a synchronous invocation throw and an awaited rejection.
 *
 * @param operation - The external call; the returned promise is awaited inside the capture.
 * @param options - Names the operation and optionally classifies the exception.
 * @returns A promise of `Ok` with the value, or `Err` with the classified problem or a {@link Fault}.
 */
export const captureAsync = async <Value = never, Problem = never>(
  operation: () => PromiseLike<Value>,
  options: CaptureOptions<Problem>,
): AsyncResult<Value, Problem | Fault> => {
  // @allow strict-fp/no-try -- Implement capture itself and its failure inspection; using capture here would recurse.
  try {
    return ok(await operation());
  } catch (cause) {
    return classifyFailure(cause, options);
  }
};

/**
 * Capture an operation that already returns a `Result`, without wrapping its failure again.
 *
 * @param operation - The call to guard against throwing before it can return a `Result`.
 * @param options - Names the operation and optionally classifies the exception.
 * @returns The operation's own result, or `Err` with the classified problem or a {@link Fault}.
 */
export const captureResult = <Value = never, Problem = never, Classified = never>(
  operation: () => Result<Value, Problem>,
  options: CaptureOptions<Classified>,
): Result<Value, Problem | Classified | Fault> => {
  const captured = capture(operation, options);
  return isErr(captured) ? captured : get(captured);
};

/**
 * Capture a pending operation that already returns a `Result`.
 *
 * @param operation - The async call to guard against throwing or rejecting.
 * @param options - Names the operation and optionally classifies the exception.
 * @returns A promise of the operation's own result, or `Err` with the classified problem or a {@link Fault}.
 */
export const captureResultAsync = async <Value = never, Problem = never, Classified = never>(
  operation: () => PromiseLike<Result<Value, Problem>>,
  options: CaptureOptions<Classified>,
): AsyncResult<Value, Problem | Classified | Fault> => {
  const captured = await captureAsync(operation, options);
  return isErr(captured) ? captured : get(captured);
};
