import { useAppStore } from './store';
import { SCHEMA_VERSION } from './migrations';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';

// Mutable so the pomodoro tests can advance time mid-test (INV-10).
const clock = { iso: '2026-08-18T12:00:00.000Z' };

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => clock.iso,
}));

function reset() {
  clock.iso = '2026-08-18T12:00:00.000Z';
  useAppStore.setState({
    schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    pomodoroSettings: DEFAULT_POMODORO_SETTINGS, pomodoro: null,
    viewedFortnightId: null, selectedDay: null, composeIntent: null,
  });
}

describe('store', () => {
  beforeEach(reset);

  it('initApp creates a fortnight anchored to today when none exists', () => {
    useAppStore.getState().initApp();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(1);
    expect(s.fortnights[0].days[0]).toBe('2026-08-17'); // Monday of 2026-08-18's week
    expect(s.activeFortnightId).toBe(s.fortnights[0].id);
    expect(s.viewedFortnightId).toBe(s.fortnights[0].id);
    expect(s.selectedDay).toBe('2026-08-18');
    expect(s.lastRolloverDay).toBe('2026-08-18');
  });

  it('addTodo / toggleDone / rescheduleTodo / deleteTodo', () => {
    const store = useAppStore.getState();
    store.initApp();
    store.addTodo({ title: 'Write spec', priority: 'high', scheduledDay: '2026-08-18' });
    let todo = Object.values(useAppStore.getState().todos)[0];
    expect(todo).toMatchObject({ title: 'Write spec', priority: 'high', done: false, rolledOver: false });

    useAppStore.getState().toggleDone(todo.id);
    todo = useAppStore.getState().todos[todo.id];
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');

    useAppStore.getState().toggleDone(todo.id);
    expect(useAppStore.getState().todos[todo.id].completedAt).toBeUndefined();

    useAppStore.getState().rescheduleTodo(todo.id, '2026-08-20');
    todo = useAppStore.getState().todos[todo.id];
    expect(todo.scheduledDay).toBe('2026-08-20');
    expect(todo.rolledOver).toBe(false);

    useAppStore.getState().deleteTodo(todo.id);
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('initApp recovers instead of crashing when activeFortnightId does not match any fortnight (lastRolloverDay already today)', () => {
    // Defense-in-depth for Critical 2: even with export validation hardened,
    // a dangling activeFortnightId must not crash initApp via a non-null
    // assertion. lastRolloverDay === today makes checkDayTick short-circuit,
    // so initApp's own fallback must catch this case.
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: 'dangling-id',
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
      viewedFortnightId: null, selectedDay: null,
    });
    expect(() => useAppStore.getState().initApp()).not.toThrow();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(1);
    expect(s.activeFortnightId).toBe(s.fortnights[0].id);
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).not.toBeNull();
  });

  it('checkDayTick recovers instead of crashing when activeFortnightId does not match any fortnight', () => {
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: 'dangling-id',
      todos: {}, notes: {}, lastRolloverDay: '2026-08-01',
      viewedFortnightId: 'dangling-id', selectedDay: null,
    });
    expect(() => useAppStore.getState().checkDayTick()).not.toThrow();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(1);
    expect(s.activeFortnightId).toBe(s.fortnights[0].id);
    expect(s.lastRolloverDay).toBe('2026-08-18');
  });

  it('note CRUD and resolveBlocker', () => {
    const store = useAppStore.getState();
    store.initApp();
    store.addNote({ day: '2026-08-18', category: 'blocker', text: 'Waiting on API keys' });
    const note = Object.values(useAppStore.getState().notes)[0];
    expect(note).toMatchObject({ category: 'blocker', resolved: false });

    useAppStore.getState().resolveBlocker(note.id);
    expect(useAppStore.getState().notes[note.id].resolved).toBe(true);

    useAppStore.getState().deleteNote(note.id);
    expect(useAppStore.getState().notes).toEqual({});
  });

  describe('setComposeIntent', () => {
    it('opens a compose form while viewing the active fortnight', () => {
      useAppStore.getState().initApp();
      useAppStore.getState().setComposeIntent('todo');
      expect(useAppStore.getState().composeIntent).toBe('todo');
    });

    it('refuses to open a compose form while viewing a read-only (past) fortnight', () => {
      // The reducer itself refuses, not just the UI that calls it -- a
      // keyboard shortcut or command-palette action could otherwise open a
      // form through a door the read-only-gated Add button never exposes,
      // reopening the INV-9 orphan-todo bug through a new path.
      useAppStore.getState().initApp();
      const activeId = useAppStore.getState().activeFortnightId!;
      useAppStore.getState().regenerateFortnight();
      useAppStore.getState().viewFortnight(activeId); // now viewing the old, read-only fortnight

      useAppStore.getState().setComposeIntent('todo');
      expect(useAppStore.getState().composeIntent).toBeNull();

      useAppStore.getState().setComposeIntent('note');
      expect(useAppStore.getState().composeIntent).toBeNull();
    });

    it('always allows closing (null), even while read-only', () => {
      useAppStore.getState().initApp();
      const activeId = useAppStore.getState().activeFortnightId!;
      useAppStore.getState().setComposeIntent('todo'); // opened while still active/writable
      useAppStore.getState().regenerateFortnight();
      useAppStore.getState().viewFortnight(activeId);

      // viewFortnight already clears it (asserted below), but the action
      // itself must never refuse a close regardless of read-only state.
      useAppStore.getState().setComposeIntent(null);
      expect(useAppStore.getState().composeIntent).toBeNull();
    });

    it('viewFortnight clears a compose form left open by the previously viewed fortnight', () => {
      useAppStore.getState().initApp();
      useAppStore.getState().setComposeIntent('note');
      expect(useAppStore.getState().composeIntent).toBe('note');

      const activeId = useAppStore.getState().activeFortnightId!;
      useAppStore.getState().viewFortnight(activeId); // switching view, even to the same fortnight
      expect(useAppStore.getState().composeIntent).toBeNull();
    });
  });
});

describe('pomodoro actions', () => {
  beforeEach(reset);
  const MIN = 60_000;

  it('startPomodoro begins a running work phase from the persisted settings', () => {
    useAppStore.getState().startPomodoro();
    const run = useAppStore.getState().pomodoro!;
    expect(run.phase).toBe('work');
    expect(run.running).toBe(true);
    expect(run.endsAt).toBe('2026-08-18T12:25:00.000Z');
  });

  it('pause freezes and resume re-derives the deadline from the frozen remainder', () => {
    useAppStore.getState().startPomodoro();
    clock.iso = '2026-08-18T12:05:00.000Z';
    useAppStore.getState().pausePomodoro();
    expect(useAppStore.getState().pomodoro!.running).toBe(false);
    expect(useAppStore.getState().pomodoro!.remainingMs).toBe(20 * MIN);

    clock.iso = '2026-08-18T13:00:00.000Z';
    useAppStore.getState().resumePomodoro();
    expect(useAppStore.getState().pomodoro!.endsAt).toBe('2026-08-18T13:20:00.000Z');
  });

  it('completePomodoroPhase advances to the break and announces it', () => {
    useAppStore.getState().startPomodoro();
    clock.iso = '2026-08-18T12:25:00.000Z';
    useAppStore.getState().completePomodoroPhase();
    const run = useAppStore.getState().pomodoro!;
    expect(run.phase).toBe('break');
    expect(run.completedWork).toBe(1);
    expect(useAppStore.getState().announcement).toMatch(/break/i);
  });

  it('skipPomodoroPhase advances without crediting a pomodoro', () => {
    useAppStore.getState().startPomodoro();
    useAppStore.getState().skipPomodoroPhase();
    const run = useAppStore.getState().pomodoro!;
    expect(run.phase).toBe('break');
    expect(run.completedWork).toBe(0);
  });

  it('stopPomodoro clears the run entirely', () => {
    useAppStore.getState().startPomodoro();
    useAppStore.getState().stopPomodoro();
    expect(useAppStore.getState().pomodoro).toBeNull();
  });

  it('setPomodoroSettings clamps to positive whole minutes and ignores junk', () => {
    useAppStore.getState().setPomodoroSettings({ workMinutes: 50 });
    expect(useAppStore.getState().pomodoroSettings.workMinutes).toBe(50);
    expect(useAppStore.getState().pomodoroSettings.breakMinutes).toBe(5);

    useAppStore.getState().setPomodoroSettings({ workMinutes: 0 });
    expect(useAppStore.getState().pomodoroSettings.workMinutes).toBe(50);
    useAppStore.getState().setPomodoroSettings({ breakMinutes: 2.7 });
    expect(useAppStore.getState().pomodoroSettings.breakMinutes).toBe(2);
    useAppStore.getState().setPomodoroSettings({ longBreakMinutes: Number.NaN });
    expect(useAppStore.getState().pomodoroSettings.longBreakMinutes).toBe(15);
  });
});
