import { appStorage, useAppStore, type AppState } from './store';
import { SCHEMA_VERSION } from './migrations';
import { serializeState, parseBackup } from './exportImport';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
      viewedFortnightId: null, selectedDay: null, rehydrationError: null, announcement: null,
      composeIntent: null,
    });
  });

  it('persists domain state under the app key, excluding UI fields', () => {
    useAppStore.getState().initApp();
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    appStorage.flush();
    const raw = localStorage.getItem('agile-todo-app.v-state');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.state.fortnights).toHaveLength(1);
    expect(Object.keys(persisted.state.todos)).toHaveLength(1);
    expect(persisted.state.viewedFortnightId).toBeUndefined();
    expect(persisted.state.selectedDay).toBeUndefined();
    // announcement is ephemeral like the two above -- never in partialize,
    // never persisted (INV-6). addTodo above set a real announcement value
    // in memory, so this only proves something if it's actually excluded.
    expect(useAppStore.getState().announcement).not.toBeNull();
    expect(persisted.state.announcement).toBeUndefined();
  });

  it('composeIntent is ephemeral -- never persisted (INV-6)', () => {
    useAppStore.getState().initApp();
    useAppStore.getState().setComposeIntent('todo');
    expect(useAppStore.getState().composeIntent).toBe('todo'); // set in memory...
    appStorage.flush();
    const persisted = JSON.parse(localStorage.getItem('agile-todo-app.v-state')!);
    expect(persisted.state.composeIntent).toBeUndefined(); // ...but excluded from the persisted blob.
  });

  it('theme is ephemeral in the store -- its durable copy is theme.ts\'s own key (INV-6)', () => {
    useAppStore.getState().initApp();
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark'); // set in memory...
    appStorage.flush();
    const persisted = JSON.parse(localStorage.getItem('agile-todo-app.v-state')!);
    expect(persisted.state.theme).toBeUndefined(); // ...but excluded from the persisted blob.
  });

  it('pomodoro run state is ephemeral, but pomodoroSettings persist (INV-6)', () => {
    useAppStore.getState().initApp();
    useAppStore.getState().startPomodoro();
    expect(useAppStore.getState().pomodoro).not.toBeNull(); // running in memory...
    appStorage.flush();
    const persisted = JSON.parse(localStorage.getItem('agile-todo-app.v-state')!);
    expect(persisted.state.pomodoro).toBeUndefined(); // ...but the run never persists,
    expect(persisted.state.pomodoroSettings).toEqual({ // only the settings do.
      workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15,
    });
  });

  it('rehydrating a v1 blob (no pomodoroSettings) migrates it to the defaults', async () => {
    appStorage.setItem('agile-todo-app.v-state', JSON.stringify({
      state: {
        schemaVersion: 1, fortnights: [], activeFortnightId: null,
        todos: {}, notes: {}, lastRolloverDay: null,
      },
      version: 1,
    }));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().rehydrationError).toBeNull();
    expect(useAppStore.getState().schemaVersion).toBe(SCHEMA_VERSION);
    expect(useAppStore.getState().pomodoroSettings).toEqual({
      workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15,
    });
  });

  it('rehydrating a v2 blob with a literal 10-day active fortnight adapts it into the containing calendar month', async () => {
    const tenDayFortnight = {
      id: 'fn-1', startDay: '2026-08-17',
      days: [
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      ],
      createdAt: '2026-08-17T00:00:00.000Z',
    };
    const staleTodo = {
      id: 't1', fortnightId: 'fn-1', title: 'stranded', priority: 'low' as const,
      scheduledDay: '2026-08-19', done: false, createdAt: '2026-08-01T00:00:00.000Z', rolledOver: false,
    };
    appStorage.setItem('agile-todo-app.v-state', JSON.stringify({
      state: {
        schemaVersion: 2, fortnights: [tenDayFortnight], activeFortnightId: 'fn-1',
        todos: { t1: staleTodo }, notes: {}, lastRolloverDay: '2026-08-17',
        pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
      },
      version: 2,
    }));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().rehydrationError).toBeNull();
    expect(useAppStore.getState().schemaVersion).toBe(SCHEMA_VERSION);
    const active = useAppStore.getState().fortnights.find((f) => f.id === 'fn-1')!;
    expect(active.days).toHaveLength(21);
    expect(active.startDay).toBe('2026-08-03');
    expect(useAppStore.getState().todos.t1).toBeDefined();
    expect(useAppStore.getState().todos.t1.scheduledDay).toBe('2026-08-19'); // already inside the month

    appStorage.flush();
    const persisted = JSON.parse(localStorage.getItem('agile-todo-app.v-state')!);
    expect(persisted.version).toBe(SCHEMA_VERSION);
  });

  it('importState replaces persisted fields and re-derives the view', () => {
    useAppStore.getState().initApp();
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    useAppStore.getState().addTodo({ title: 'will vanish', priority: 'low', scheduledDay: '2026-08-18' });
    useAppStore.getState().importState(snapshot);
    expect(useAppStore.getState().todos).toEqual({});
    expect(useAppStore.getState().viewedFortnightId).toBe(snapshot.activeFortnightId);
  });

  it('importState does not spread unvalidated extra keys over store actions (Important 4)', () => {
    useAppStore.getState().initApp();
    const toggleDoneBefore = useAppStore.getState().toggleDone;
    // Simulate a backup JSON blob with an extra key that collides with an
    // action name. If importState ever goes back to `set({ ...state, ... })`
    // this would clobber the `toggleDone` action with `null`.
    const malicious = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
      toggleDone: null,
    } as unknown as Parameters<AppState['importState']>[0];
    useAppStore.getState().importState(malicious);
    expect(useAppStore.getState().toggleDone).toBe(toggleDoneBefore);
    expect(typeof useAppStore.getState().toggleDone).toBe('function');
  });

  it('importState rolls forward past-day todos immediately via checkDayTick (Important 5)', () => {
    useAppStore.getState().initApp();
    const fn = useAppStore.getState().fortnights[0];
    const snapshot = {
      schemaVersion: 1,
      fortnights: [fn],
      activeFortnightId: fn.id,
      todos: {
        stale: {
          id: 'stale', fortnightId: fn.id, title: 'stranded', priority: 'low' as const,
          scheduledDay: fn.days[0], done: false, createdAt: '2026-08-01T00:00:00.000Z', rolledOver: false,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-01', // stale relative to the mocked "today" of 2026-08-18
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    useAppStore.getState().importState(snapshot);
    const imported = useAppStore.getState().todos['stale'];
    expect(imported.scheduledDay).toBe('2026-08-18');
    expect(imported.rolledOver).toBe(true);
    expect(useAppStore.getState().lastRolloverDay).toBe('2026-08-18');
  });

  it('round-trips note.rolledOver through export -> import, and a legacy note without the field still imports', () => {
    useAppStore.getState().initApp();
    const fn = useAppStore.getState().fortnights[0];
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {},
      notes: {
        rolled: {
          id: 'rolled', fortnightId: fn.id, day: fn.days[0], category: 'blocker' as const,
          text: 'stale', resolved: false, createdAt: '2026-08-01T00:00:00.000Z', rolledOver: true,
        },
        legacy: {
          id: 'legacy', fortnightId: fn.id, day: fn.days[0], category: 'info' as const,
          text: 'no rolledOver field at all', resolved: false, createdAt: '2026-08-01T00:00:00.000Z',
        },
      },
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    const serialized = serializeState(snapshot);
    const parsed = parseBackup(serialized);
    expect(parsed.notes.rolled.rolledOver).toBe(true);
    expect(parsed.notes.legacy.rolledOver).toBeUndefined();
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);

    useAppStore.getState().importState(parsed);
    expect(useAppStore.getState().notes.rolled.rolledOver).toBe(true);
    expect(useAppStore.getState().notes.legacy.rolledOver).toBeUndefined();
  });

  it('round-trips a todo checklist through export -> import', () => {
    useAppStore.getState().initApp();
    const fn = useAppStore.getState().fortnights[0];
    const checklist = [
      { id: 'c1', text: 'done part', checked: true },
      { id: 'c2', text: 'open part', checked: false },
    ];
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {
        t1: {
          id: 't1', fortnightId: fn.id, title: 'with checklist', priority: 'medium' as const,
          scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
          rolledOver: false, checklist,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    const parsed = parseBackup(serializeState(snapshot));
    expect(parsed.todos.t1.checklist).toEqual(checklist);

    useAppStore.getState().importState(parsed);
    expect(useAppStore.getState().todos.t1.checklist).toEqual(checklist);
  });

  it('round-trips todo.sortIndex through export -> import', () => {
    useAppStore.getState().initApp();
    const fn = useAppStore.getState().fortnights[0];
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {
        t1: {
          id: 't1', fortnightId: fn.id, title: 'with sortIndex', priority: 'medium' as const,
          scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
          rolledOver: false, sortIndex: 3,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    const parsed = parseBackup(serializeState(snapshot));
    expect(parsed.todos.t1.sortIndex).toBe(3);

    useAppStore.getState().importState(parsed);
    expect(useAppStore.getState().todos.t1.sortIndex).toBe(3);
  });

  it('onRehydrateStorage sets rehydrationError on corrupt storage, and initApp does not silently create+persist over it (Important 3)', async () => {
    // Write directly through appStorage (not localStorage) so this doesn't
    // race a debounced write already pending from this test's own beforeEach
    // reset — appStorage.getItem prefers its in-flight pending value over
    // whatever's actually in localStorage.
    appStorage.setItem('agile-todo-app.v-state', 'not valid json{{{');
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().rehydrationError).toEqual(expect.any(String));
    expect(useAppStore.getState().rehydrationError).not.toBe('');

    useAppStore.getState().initApp();
    expect(useAppStore.getState().fortnights).toHaveLength(0);
    expect(useAppStore.getState().activeFortnightId).toBeNull();

    appStorage.flush();
    // The original (corrupt) stored value must be left untouched rather than
    // overwritten by a freshly auto-created empty fortnight — this exercises
    // the storage guard: setting rehydrationError itself schedules a set()
    // call, which must NOT be allowed to persist over the recoverable data.
    expect(localStorage.getItem('agile-todo-app.v-state')).toBe('not valid json{{{');
  });
});
