import { describe, expect, it } from 'vitest';
import { err, formatDiagnostic, get, getError, isErr, ok, unit } from '#src/index.ts';
describe('diagnostic presentation independent of wire DTOs', () => {
  it('makes Unit and native errors visible inside opaque containers', () => {
    expect(formatDiagnostic(ok())).toEqual(ok('{"status":"ok","value":"Unit"}'));
    expect(formatDiagnostic(unit())).toEqual(ok('"Unit"'));
    const cause = new Error('disk problem');
    const issue = Object.assign(new Error('operation failed', { cause }), { code: 'E_TEST' });
    const formatted = formatDiagnostic(err(issue));
    if (isErr(formatted)) expect.fail(getError(formatted).message);
    expect(get(formatted)).toContain('operation failed');
    expect(get(formatted)).toContain('disk problem');
    expect(get(formatted)).toContain('Error');
    expect(get(formatted)).toContain('E_TEST');
    const withoutStack = new Error('message only');
    Object.defineProperty(withoutStack, 'stack', { value: false });
    expect(formatDiagnostic(withoutStack)).toEqual(ok('{"name":"Error","message":"message only"}'));
  });
});
