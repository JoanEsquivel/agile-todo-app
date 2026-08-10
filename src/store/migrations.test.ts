import { runMigrations, SCHEMA_VERSION, UnsupportedSchemaError } from './migrations';
import type { PersistedState } from '../domain/types';

const current: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
};

describe('runMigrations', () => {
  it('is identity at the current version', () => {
    expect(runMigrations(current, SCHEMA_VERSION)).toEqual(current);
  });

  it('applies migration steps in sequence', () => {
    const v0 = { fortnights: [], activeFortnightId: null, todos: {}, notes: {} };
    const steps = { 0: (s: unknown) => ({ ...(s as object), lastRolloverDay: null }) };
    const res = runMigrations(v0, 0, steps);
    expect(res.lastRolloverDay).toBeNull();
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects newer-than-supported versions', () => {
    expect(() => runMigrations(current, SCHEMA_VERSION + 1)).toThrow(UnsupportedSchemaError);
  });
});
