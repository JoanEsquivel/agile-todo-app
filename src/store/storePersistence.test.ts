import { appStorage, useAppStore, type AppState } from './store';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
      viewedFortnightId: null, selectedDay: null, rehydrationError: null, announcement: null,
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

  it('importState replaces persisted fields and re-derives the view', () => {
    useAppStore.getState().initApp();
    const snapshot = {
      schemaVersion: 1,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
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
      schemaVersion: 1,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
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
    };
    useAppStore.getState().importState(snapshot);
    const imported = useAppStore.getState().todos['stale'];
    expect(imported.scheduledDay).toBe('2026-08-18');
    expect(imported.rolledOver).toBe(true);
    expect(useAppStore.getState().lastRolloverDay).toBe('2026-08-18');
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
