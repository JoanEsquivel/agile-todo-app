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

  it('rejects a dangling activeFortnightId that does not match any fortnight', () => {
    // A backup like this would previously pass validation, get written straight
    // into the store, and brick the *next* app load: initApp -> checkDayTick
    // does a non-null-asserted fortnights.find(...) that resolves to undefined.
    const dangling: PersistedState = { ...good, activeFortnightId: 'does-not-exist' };
    expect(validatePersistedState(dangling)).toBe(false);
  });

  it('accepts activeFortnightId when it matches a real fortnight', () => {
    const fortnight = {
      id: 'fn-1', startDay: '2026-08-17', days: ['2026-08-17'], createdAt: '2026-08-17T00:00:00.000Z',
    };
    const valid: PersistedState = { ...good, fortnights: [fortnight], activeFortnightId: 'fn-1' };
    expect(validatePersistedState(valid)).toBe(true);
  });

  it('parseBackup rejects a backup file with a dangling activeFortnightId', () => {
    const dangling = JSON.stringify({ ...good, activeFortnightId: 'does-not-exist' });
    expect(() => parseBackup(dangling)).toThrow(/malformed/i);
  });

  it('rejects invalid JSON with a readable error', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/i);
  });

  it('rejects newer schema versions with a readable error', () => {
    const newer = JSON.stringify({ ...good, schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => parseBackup(newer)).toThrow(/newer|supports up to/i);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/not an Agile Todo backup/i);
  });

  it('rejects a malformed backup that survives the version sniff', () => {
    const malformed = JSON.stringify({ schemaVersion: SCHEMA_VERSION, todos: 'nope' });
    expect(() => parseBackup(malformed)).toThrow(/malformed/i);
  });
});
