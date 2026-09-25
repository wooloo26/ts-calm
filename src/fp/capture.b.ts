/**
 * @boundary Convert dependency exceptions and classifier defects into explicit Result failures.
 * @allow strict-fp/no-try -- Catch only at the supplied operation and classifier boundary.
 */
import { err, get, isErr, isSome, none, ok } from './containers.ts';
import type { AsyncResult, Option, Result } from './containers.ts';
import type { Synchronous } from './contracts.ts';

export type Fault = Readonly<{
  code: 'unexpected-fault';
  operation: string;
  message: string;
  cause: unknown;
}>;
export type CaptureOptions<Problem> = Readonly<{
  name: string;
  classify?: (cause: unknown) => Option<Problem>;
}>;

const faultMessage = (cause: unknown): string => {
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
  try {
    const classified = options.classify ? options.classify(cause) : none();
    return isSome(classified) ? err(get(classified)) : err(unexpected(options.name, cause));
  } catch (classificationCause) {
    return err(unexpected(`${options.name}.classify`, classificationCause));
  }
};

export const capture = <Value = never, Problem = never>(
  operation: () => Synchronous<Value>,
  options: CaptureOptions<Problem>,
): Result<Value, Problem | Fault> => {
  try {
    return ok(operation());
  } catch (cause) {
    return classifyFailure(cause, options);
  }
};

export const captureAsync = async <Value = never, Problem = never>(
  operation: () => PromiseLike<Value>,
  options: CaptureOptions<Problem>,
): AsyncResult<Value, Problem | Fault> => {
  try {
    return ok(await operation());
  } catch (cause) {
    return classifyFailure(cause, options);
  }
};

export const captureResult = <Value = never, Problem = never, Classified = never>(
  operation: () => Result<Value, Problem>,
  options: CaptureOptions<Classified>,
): Result<Value, Problem | Classified | Fault> => {
  const captured = capture(operation, options);
  return isErr(captured) ? captured : get(captured);
};

export const captureResultAsync = async <Value = never, Problem = never, Classified = never>(
  operation: () => PromiseLike<Result<Value, Problem>>,
  options: CaptureOptions<Classified>,
): AsyncResult<Value, Problem | Classified | Fault> => {
  const captured = await captureAsync(operation, options);
  return isErr(captured) ? captured : get(captured);
};
