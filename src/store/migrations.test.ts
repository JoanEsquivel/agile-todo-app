import { runMigrations, SCHEMA_VERSION, UnsupportedSchemaError } from './migrations';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';
import type { PersistedState } from '../domain/types';

const current: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
  pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
};

describe('runMigrations', () => {
  it('is identity at the current version', () => {
    expect(runMigrations(current, SCHEMA_VERSION)).toEqual(current);
  });

  it('applies migration steps in sequence', () => {
    const v0 = { fortnights: [], activeFortnightId: null, todos: {}, notes: {} };
    const steps = {
      0: (s: unknown) => ({ ...(s as object), lastRolloverDay: null }),
      1: (s: unknown) => ({ ...(s as object), pomodoroSettings: DEFAULT_POMODORO_SETTINGS }),
    };
    const res = runMigrations(v0, 0, steps);
    expect(res.lastRolloverDay).toBeNull();
    expect(res.pomodoroSettings).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects newer-than-supported versions', () => {
    expect(() => runMigrations(current, SCHEMA_VERSION + 1)).toThrow(UnsupportedSchemaError);
  });

  it('migrates a v1 document (no pomodoro settings) by filling the defaults', () => {
    const v1 = {
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
    };
    const res = runMigrations(v1, 1);
    expect(res.pomodoroSettings).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
