import { parseBackup, serializeState, validatePersistedState } from './exportImport';
import { SCHEMA_VERSION } from './migrations';
import type { PersistedState } from '../domain/types';

const good: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
};

describe('backup export/import', () => {
  it('round-trips serialize -> parseBackup', () => {
    expect(parseBackup(serializeState(good))).toEqual(good);
  });

  it('validatePersistedState accepts a good document and rejects garbage', () => {
    expect(validatePersistedState(good)).toBe(true);
    expect(validatePersistedState(null)).toBe(false);
    expect(validatePersistedState({ schemaVersion: 1 })).toBe(false);
    expect(validatePersistedState({ ...good, todos: 'nope' })).toBe(false);
  });

  it('rejects invalid JSON with a readable error', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/i);
  });

  it('rejects newer schema versions with a readable error', () => {
    const newer = JSON.stringify({ ...good, schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => parseBackup(newer)).toThrow(/newer|supports up to/i);
  });
});
