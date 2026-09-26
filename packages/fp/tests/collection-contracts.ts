import { describe, expect, it } from 'vitest';
import { all, err, filter, ok } from '@ts-calm/fp';

describe('named independent validation', () => {
  it('collects named results without requiring array iteration', () => {
    expect(() => all({ identifier: ok('player'), revision: ok(2) })).not.toThrow();
    expect(all({ identifier: ok('player'), revision: ok(2) })).toEqual(
      ok({ identifier: 'player', revision: 2 }),
    );
  });
  it('retains Result failures and lazily constructs rejected predicate errors', () => {
    expect(
      filter(
        ok(2),
        (value) => value > 0,
        () => 'invalid',
      ),
    ).toEqual(ok(2));
    expect(
      filter(
        ok(-2),
        (value) => value > 0,
        () => 'invalid',
      ),
    ).toEqual(err('invalid'));
    expect(
      filter(
        err('original'),
        () => true,
        () => 'invalid',
      ),
    ).toEqual(err('original'));
  });
});
