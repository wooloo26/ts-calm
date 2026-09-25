import { assert, array, property, string } from 'fast-check';
import { expect, expectTypeOf, test } from 'vitest';
import { isUniqueBy } from '#fp/index';
import { raise } from '#fixtures/fp/foundation';

test('checks selected keys without mutating input and stops at the first duplicate', () => {
  const visits: string[] = [];
  const values = Object.freeze([{ id: 'same' }, { id: 'same' }, { id: 'later' }]);
  expect(
    isUniqueBy(values, (value) => {
      visits.push(value.id);
      return value.id;
    }),
  ).toBe(false);
  expect(visits).toEqual(['same', 'same']);
  expect(values).toEqual([{ id: 'same' }, { id: 'same' }, { id: 'later' }]);
  expect(isUniqueBy([], () => raise('Empty input must not call the selector'))).toBe(true);
  expect(isUniqueBy([{ id: 'one' }, { id: 'two' }], (value) => value.id)).toBe(true);
});

test('uses SameValueZero equality for numeric keys and symbol identity', () => {
  expect(isUniqueBy([Number.NaN, Number.NaN], (value) => value)).toBe(false);
  expect(isUniqueBy([0, -0], (value) => value)).toBe(false);
  const shared = Symbol('shared');
  expect(isUniqueBy([shared, shared], (value) => value)).toBe(false);
  expect(isUniqueBy([Symbol('name'), Symbol('name')], (value) => value)).toBe(true);
});

test('does not capture selector defects', () => {
  const defect = new Error('selector defect');
  expect(() => isUniqueBy([1], () => raise(defect))).toThrow(defect);
});

test('agrees with the first-occurrence uniqueness law', () => {
  assert(
    property(array(string(), { maxLength: 60 }), (values) => {
      expect(isUniqueBy(values, (value) => value)).toBe(
        values.every((value, index) => values.indexOf(value) === index),
      );
    }),
  );
});

test('accepts readonly collections and synchronous property keys', () => {
  type Selector = Parameters<typeof isUniqueBy<Readonly<{ id: string }>, string>>[1];
  expectTypeOf<(value: Readonly<{ id: string }>) => Promise<string>>().not.toExtend<Selector>();
  expectTypeOf<
    (value: Readonly<{ id: string }>) => Readonly<{ key: string }>
  >().not.toExtend<Selector>();
  expectTypeOf(isUniqueBy(Object.freeze([1]), (value) => value)).toEqualTypeOf<boolean>();
});
