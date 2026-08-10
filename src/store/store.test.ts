import { useAppStore } from './store';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

function reset() {
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
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
});
