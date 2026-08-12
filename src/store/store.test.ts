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
    expect(s.fortnights[0].days[0]).toBe('2026-08-03'); // first workday of August 2026
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

  describe('reorderTodo', () => {
    it('reorders and announces the new position (1-based)', () => {
      const st = useAppStore.getState();
      st.initApp();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
      const b = Object.values(useAppStore.getState().todos).find((t) => t.title === 'B')!;
      useAppStore.getState().reorderTodo(b.id, 'medium', 0);
      expect(useAppStore.getState().todos[b.id].sortIndex).toBe(0);
      expect(useAppStore.getState().announcement).toBe('Moved "B" to Medium, position 1 of 2');
    });

    it('cross-band call re-prioritizes', () => {
      const st = useAppStore.getState();
      st.initApp();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      const a = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().reorderTodo(a.id, 'high', 0);
      expect(useAppStore.getState().todos[a.id].priority).toBe('high');
    });

    it('refuses while viewing a read-only fortnight (INV-9)', () => {
      const st = useAppStore.getState();
      st.initApp();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
      const b = Object.values(useAppStore.getState().todos).find((t) => t.title === 'B')!;
      useAppStore.setState({ viewedFortnightId: 'some-old-fortnight' });
      useAppStore.getState().reorderTodo(b.id, 'medium', 0);
      expect(useAppStore.getState().todos[b.id].sortIndex).toBeUndefined();
    });

    it('no-op on done todos', () => {
      const st = useAppStore.getState();
      st.initApp();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      const a = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().toggleDone(a.id);
      useAppStore.getState().reorderTodo(a.id, 'high', 0);
      expect(useAppStore.getState().todos[a.id].priority).toBe('medium');
    });

    it('is a true no-op when dropped at its current position -- no re-announcement, no todos reference change', () => {
      const st = useAppStore.getState();
      st.initApp();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      const a = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().reorderTodo(a.id, 'medium', 0); // real move: materializes sortIndex 0
      const todosBefore = useAppStore.getState().todos;
      useAppStore.getState().announce('sentinel');

      useAppStore.getState().reorderTodo(a.id, 'medium', 0); // dropped back at its own position

      expect(useAppStore.getState().announcement).toBe('sentinel');
      expect(useAppStore.getState().todos).toBe(todosBefore);
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

describe('checklist actions', () => {
  beforeEach(reset);

  function seedTodo(): string {
    useAppStore.getState().initApp();
    useAppStore.getState().addTodo({ title: 'Big task', priority: 'medium', scheduledDay: '2026-08-18' });
    return Object.values(useAppStore.getState().todos)[0].id;
  }

  it('addChecklistItem appends an unchecked item with trimmed text and a generated id', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, '  first part  ');
    const checklist = useAppStore.getState().todos[id].checklist!;
    expect(checklist).toHaveLength(1);
    expect(checklist[0]).toMatchObject({ text: 'first part', checked: false });
    expect(checklist[0].id).toEqual(expect.any(String));
    expect(checklist[0].id).not.toBe('');
  });

  it('addChecklistItem rejects empty and whitespace-only text', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, '');
    useAppStore.getState().addChecklistItem(id, '   ');
    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
  });

  it('toggleChecklistItem checking the last item completes the todo; unchecking reopens it', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'only part');
    const itemId = useAppStore.getState().todos[id].checklist![0].id;

    useAppStore.getState().toggleChecklistItem(id, itemId);
    let todo = useAppStore.getState().todos[id];
    expect(todo.checklist![0].checked).toBe(true);
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');

    useAppStore.getState().toggleChecklistItem(id, itemId);
    todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
  });

  it('toggleDone on a checklist todo syncs every item both ways', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');

    useAppStore.getState().toggleDone(id);
    let todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');
    expect(todo.checklist!.every((i) => i.checked)).toBe(true);

    useAppStore.getState().toggleDone(id);
    todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
    expect(todo.checklist!.every((i) => !i.checked)).toBe(true);
  });

  it('removeChecklistItem removes one item; removing the final item clears the checklist field', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');
    const [a, b] = useAppStore.getState().todos[id].checklist!;

    useAppStore.getState().removeChecklistItem(id, a.id);
    expect(useAppStore.getState().todos[id].checklist).toHaveLength(1);
    expect(useAppStore.getState().todos[id].checklist![0].id).toBe(b.id);

    useAppStore.getState().removeChecklistItem(id, b.id);
    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
  });
});
