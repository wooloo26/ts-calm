export const structuralLookalike = { kind: 'ok', value: 1 };

export const raise = (cause: unknown): never => {
  throw cause;
};

import type { JsonValue } from '#fp/json.b';
export const invalidJsonFixture = (value: unknown): JsonValue => value as JsonValue;
export const nullPrototypeFixture = (): unknown => Object.assign(Object.create(null), { value: 1 });
export const sparseArrayFixture = (length: number): unknown[] => {
  const value: unknown[] = [];
  value.length = length;
  return value;
};
export const missingJsonOutputFixture = (): ReturnType<typeof JSON.stringify> =>
  JSON.stringify(Symbol('unrepresentable'));

export const presentMissingFixture = (): readonly unknown[] => [undefined];
export const inheritedRecordFixture = (): Readonly<Record<string, number>> =>
  Object.create({ inherited: 1 }, { own: { value: 0, enumerable: true } });
