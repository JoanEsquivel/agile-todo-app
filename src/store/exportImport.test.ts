import { parseBackup, serializeState, validatePersistedState } from './exportImport';
import { SCHEMA_VERSION } from './migrations';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';
import type { Fortnight, PersistedState } from '../domain/types';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

const good: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
  pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
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

  it('rejects a malformed pre-v3 backup (missing fortnights) with a readable error instead of a raw TypeError', () => {
    // parseBackup runs runMigrations on unvalidated raw JSON *before*
    // validatePersistedState -- the v2->v3 step must not dereference
    // `fortnights` (e.g. `.find`) without checking it's actually an array
    // first, or a corrupt v1/v2 backup crashes with a raw TypeError instead
    // of the app's normal "malformed backup" message.
    const malformedV2 = JSON.stringify({ schemaVersion: 2, todos: 'nope' });
    expect(() => parseBackup(malformedV2)).toThrow(/malformed/i);

    const malformedV1 = JSON.stringify({ schemaVersion: 1, fortnights: undefined, todos: 'nope' });
    expect(() => parseBackup(malformedV1)).toThrow(/malformed/i);
  });

  it('rejects missing or malformed pomodoro settings', () => {
    const { pomodoroSettings: _dropped, ...withoutSettings } = good;
    expect(validatePersistedState(withoutSettings)).toBe(false);
    expect(validatePersistedState({ ...good, pomodoroSettings: { workMinutes: 0, breakMinutes: 5, longBreakMinutes: 15 } })).toBe(false);
    expect(validatePersistedState({ ...good, pomodoroSettings: { workMinutes: '25', breakMinutes: 5, longBreakMinutes: 15 } })).toBe(false);
  });

  it('imports a pre-pomodoro v1 backup by filling default settings', () => {
    const v1 = JSON.stringify({
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
    });
    expect(parseBackup(v1).pomodoroSettings).toEqual(DEFAULT_POMODORO_SETTINGS);
  });

  it('round-trips customised pomodoro settings', () => {
    const custom: PersistedState = {
      ...good,
      pomodoroSettings: { workMinutes: 50, breakMinutes: 10, longBreakMinutes: 30 },
    };
    expect(parseBackup(serializeState(custom)).pomodoroSettings).toEqual(custom.pomodoroSettings);
  });

  describe('v3 calendar-month fortnight reshape', () => {
    it('a v3 backup round-trips through parseBackup unchanged (no re-adaptation)', () => {
      const monthFortnight: Fortnight = {
        id: 'fn-month', startDay: '2026-08-03',
        days: [
          '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
          '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
          '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
          '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
          '2026-08-31',
        ],
        createdAt: '2026-08-01T00:00:00.000Z',
      };
      const v3: PersistedState = {
        ...good, fortnights: [monthFortnight], activeFortnightId: 'fn-month',
      };
      expect(parseBackup(serializeState(v3))).toEqual(v3);
    });

    it('a v2 backup with a literal 10-day active fortnight is adapted into the containing calendar month on import', () => {
      const tenDayFortnight = {
        id: 'fn-1', startDay: '2026-08-17',
        days: [
          '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
          '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
        ],
        createdAt: '2026-08-17T00:00:00.000Z',
      };
      const v2 = JSON.stringify({
        schemaVersion: 2, fortnights: [tenDayFortnight], activeFortnightId: 'fn-1',
        todos: {}, notes: {}, lastRolloverDay: '2026-08-17',
        pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
      });
      const imported = parseBackup(v2);
      expect(imported.schemaVersion).toBe(SCHEMA_VERSION);
      const fn = imported.fortnights.find((f) => f.id === 'fn-1')!;
      expect(fn.days).toHaveLength(21);
      expect(fn.startDay).toBe('2026-08-03');
      expect(fn.days[fn.days.length - 1]).toBe('2026-08-31');
    });
  });
});
