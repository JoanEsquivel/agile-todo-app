import { runMigrations, SCHEMA_VERSION, UnsupportedSchemaError } from './migrations';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';
import type { Fortnight, PersistedState, Todo } from '../domain/types';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

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
    // Custom step map exercising runMigrations' own chaining mechanics, not
    // the real defaultSteps -- it must still cover every source version up
    // to SCHEMA_VERSION (currently 0, 1, 2) or the loop throws.
    const steps = {
      0: (s: unknown) => ({ ...(s as object), lastRolloverDay: null }),
      1: (s: unknown) => ({ ...(s as object), pomodoroSettings: DEFAULT_POMODORO_SETTINGS }),
      2: (s: unknown) => s,
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

  describe('v2 -> v3: reshapes the active fortnight into a calendar month', () => {
    // Literal 10-workday fortnight, Aug 17 - Aug 28, overlapping the mocked
    // "today" (2026-08-18) month.
    const active: Fortnight = {
      id: 'f1',
      startDay: '2026-08-17',
      days: [
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      ],
      createdAt: '2026-08-17T09:00:00.000Z',
    };
    const staleTodo: Todo = {
      id: 't1', fortnightId: 'f1', title: 'x', priority: 'low',
      scheduledDay: '2026-08-19', done: false, createdAt: '2026-08-01T00:00:00.000Z', rolledOver: false,
    };

    function v2blob(overrides: Partial<PersistedState> = {}): PersistedState {
      return {
        schemaVersion: 2,
        fortnights: [active],
        activeFortnightId: 'f1',
        todos: { t1: staleTodo },
        notes: {},
        lastRolloverDay: '2026-08-17',
        pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
        ...overrides,
      };
    }

    it('adapts the active fortnight when its days overlap the current month', () => {
      const res = runMigrations(v2blob(), 2);
      const fn = res.fortnights.find((f) => f.id === 'f1')!;
      expect(fn.days).toHaveLength(21);
      expect(fn.startDay).toBe('2026-08-03');
      expect(fn.days[fn.days.length - 1]).toBe('2026-08-31');
      // schema advances even though the fortnight's own id/createdAt survive.
      expect(res.schemaVersion).toBe(SCHEMA_VERSION);
      expect(res.todos.t1.scheduledDay).toBe('2026-08-19'); // already inside the month
      // lastRolloverDay is untouched by this step (INV-5): checkDayTick owns it.
      expect(res.lastRolloverDay).toBe('2026-08-17');
    });

    it('passes through unchanged when there is no active fortnight', () => {
      const res = runMigrations(v2blob({ fortnights: [], activeFortnightId: null, todos: {} }), 2);
      expect(res.fortnights).toEqual([]);
      expect(res.activeFortnightId).toBeNull();
    });

    it('passes through unchanged when the active fortnight does not overlap the current month', () => {
      const juneFortnight: Fortnight = {
        id: 'f2',
        startDay: '2026-06-15',
        days: [
          '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19',
          '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
        ],
        createdAt: '2026-06-15T09:00:00.000Z',
      };
      const res = runMigrations(
        v2blob({ fortnights: [juneFortnight], activeFortnightId: 'f2', todos: {} }),
        2,
      );
      expect(res.fortnights).toEqual([juneFortnight]);
    });
  });

  describe('v1 -> v3 chain', () => {
    it('fills pomodoro defaults AND adapts the active fortnight in one pass', () => {
      const active: Fortnight = {
        id: 'f1',
        startDay: '2026-08-17',
        days: [
          '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
          '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
        ],
        createdAt: '2026-08-17T09:00:00.000Z',
      };
      const v1 = {
        schemaVersion: 1, fortnights: [active], activeFortnightId: 'f1',
        todos: {}, notes: {}, lastRolloverDay: '2026-08-17',
      };
      const res = runMigrations(v1, 1);
      expect(res.pomodoroSettings).toEqual(DEFAULT_POMODORO_SETTINGS);
      expect(res.schemaVersion).toBe(SCHEMA_VERSION);
      const fn = res.fortnights.find((f) => f.id === 'f1')!;
      expect(fn.days).toHaveLength(21);
      expect(fn.startDay).toBe('2026-08-03');
    });

    it('a v1 document with no fortnights passes through step 2 unchanged (pre-existing v1->v2 behavior)', () => {
      const v1 = {
        schemaVersion: 1, fortnights: [], activeFortnightId: null,
        todos: {}, notes: {}, lastRolloverDay: null,
      };
      const res = runMigrations(v1, 1);
      expect(res.fortnights).toEqual([]);
      expect(res.activeFortnightId).toBeNull();
      expect(res.pomodoroSettings).toEqual(DEFAULT_POMODORO_SETTINGS);
    });
  });
});
