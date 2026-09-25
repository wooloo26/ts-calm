import { describe, expect, it } from 'vitest';
import { fromNullable, isNone, isNonNullable, isSome, some } from '#src/index.ts';

describe('external empty values', () => {
  it('rejects only null and undefined', () => {
    expect(isNone(fromNullable(null))).toBe(true);
    expect(isNone(fromNullable(undefined))).toBe(true);
    expect(isNonNullable(null)).toBe(false);
    expect(isNonNullable(undefined)).toBe(false);
    expect(isNonNullable(0)).toBe(true);
    expect(isNonNullable(false)).toBe(true);
    expect(isNonNullable('')).toBe(true);
  });
  it('keeps zero, false and the empty string inside the Option', () => {
    for (const value of [0, -0, false, '']) expect(isSome(fromNullable(value))).toBe(true);
    expect(fromNullable(0)).toEqual(some(0));
    expect(fromNullable(false)).toEqual(some(false));
    expect(fromNullable('')).toEqual(some(''));
  });
});
