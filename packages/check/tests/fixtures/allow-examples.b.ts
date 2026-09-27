/** @boundary Adapt protocol sentinels, fixed callbacks and existing exception contracts. */
import { completeWithCleanup, err, fromNullable, getOrElse, isString, ok } from '@ts-calm/fp';
import { capture } from '@ts-calm/fp/boundary';

// example: protocol
export const protocolEmpty = () => {
  // @allow strict-fp/no-null -- The wire protocol requires a real null scalar; Option would change the payload.
  return null;
};
// endexample

// example: callback
// @allow function-params -- The vendor invokes this exact four-argument callback; an options object is incompatible.
export const vendorCallback = (
  error: unknown,
  request: unknown,
  response: unknown,
  next: () => void,
) => {
  next();
  return { error, request, response };
};
// endexample

// example: cleanup
export const preserveCleanup = <Value>(operation: () => Value, cleanup: () => void): Value => {
  // @allow strict-fp/no-try -- This existing API requires finally completion semantics, including cleanup replacing a pending throw.
  try {
    return operation();
  } finally {
    cleanup();
  }
};
// endexample

// example: result-cleanup
export const completeSafely = (operation: () => string, cleanup: () => void) => {
  const primary = capture(operation, { name: 'primary' });
  const cleaned = capture(cleanup, { name: 'cleanup' });
  return completeWithCleanup(primary, [cleaned]);
};
// endexample

// example: alternatives
export const externalLabel = (input: unknown) => getOrElse(fromNullable(input), () => 'anonymous');
export const decodeName = (input: unknown) =>
  isString(input) && input.trim() ? ok(input.trim()) : err('invalid-name');
// endexample
