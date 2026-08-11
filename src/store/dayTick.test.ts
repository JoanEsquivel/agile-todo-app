import { useAppStore } from './store';

const clock = { today: '2026-08-18' };
vi.mock('./clock', () => ({
  todayLocal: () => clock.today,
  nowIso: () => `${clock.today}T12:00:00.000Z`,
}));

function reset() {
  clock.today = '2026-08-18';
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
  useAppStore.getState().initApp();
}

describe('checkDayTick', () => {
  beforeEach(reset);

  it('rolls incomplete todos forward exactly once per day change', () => {
    useAppStore.getState().addTodo({ title: 'a', priority: 'low', scheduledDay: '2026-08-18' });
    clock.today = '2026-08-19';
    useAppStore.getState().checkDayTick();
    const afterFirst = Object.values(useAppStore.getState().todos)[0];
    expect(afterFirst).toMatchObject({ scheduledDay: '2026-08-19', rolledOver: true });
    expect(useAppStore.getState().lastRolloverDay).toBe('2026-08-19');
    expect(useAppStore.getState().selectedDay).toBe('2026-08-19');

    useAppStore.getState().checkDayTick(); // same day again: no-op
    expect(Object.values(useAppStore.getState().todos)[0]).toEqual(afterFirst);
  });

  it('rolls an unresolved blocker note forward, leaves info/resolved notes alone', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'blocked' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'info', text: 'fyi' });
    const notes = Object.values(useAppStore.getState().notes);
    const blocker = notes.find((n) => n.category === 'blocker')!;
    const info = notes.find((n) => n.category === 'info')!;
    useAppStore.getState().resolveBlocker(blocker.id); // start a second, unresolved blocker instead
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'still blocked' });

    clock.today = '2026-08-19';
    useAppStore.getState().checkDayTick();

    const after = useAppStore.getState().notes;
    expect(after[blocker.id]).toMatchObject({ day: '2026-08-18', resolved: true }); // resolved: untouched
    expect(after[info.id]).toMatchObject({ day: '2026-08-18' }); // info: untouched
    const stillBlocked = Object.values(after).find((n) => n.text === 'still blocked')!;
    expect(stillBlocked).toMatchObject({ day: '2026-08-19', rolledOver: true });

    const afterFirst = { ...after };
    useAppStore.getState().checkDayTick(); // same day again: no-op
    expect(useAppStore.getState().notes).toEqual(afterFirst);
  });
});

describe('regenerateFortnight', () => {
  beforeEach(reset);

  it('appends a new active fortnight and carries incomplete todos over', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'shipped', priority: 'low', scheduledDay: '2026-08-18' });
    const shipped = Object.values(useAppStore.getState().todos).find((t) => t.title === 'shipped')!;
    useAppStore.getState().toggleDone(shipped.id);

    // The active period (Aug 3-31, the calendar month) is still active; force
    // a regenerate mid-flight. Regenerating within the same month produces a
    // second period with the SAME days but a new id -- permitted (INV-5); the
    // switcher tells them apart with "(current)".
    clock.today = '2026-08-25';
    const oldId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();

    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe(oldId);
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
    expect(pending.fortnightId).toBe(s.activeFortnightId);
    expect(pending.scheduledDay).toBe('2026-08-25');
    expect(pending.rolledOver).toBe(true);
    expect(Object.values(s.todos).find((t) => t.title === 'shipped')!.fortnightId).toBe(oldId);
  });

  it('carries an unresolved blocker note over, leaves a resolved one behind', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'open blocker' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'closed blocker' });
    const closed = Object.values(useAppStore.getState().notes).find((n) => n.text === 'closed blocker')!;
    useAppStore.getState().resolveBlocker(closed.id);

    clock.today = '2026-08-25';
    const oldId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();

    const s = useAppStore.getState();
    const open = Object.values(s.notes).find((n) => n.text === 'open blocker')!;
    expect(open.fortnightId).toBe(s.activeFortnightId);
    expect(open.day).toBe('2026-08-25');
    expect(open.rolledOver).toBe(true);
    expect(Object.values(s.notes).find((n) => n.text === 'closed blocker')!.fortnightId).toBe(oldId);
    expect(s.lastRolloverDay).toBe('2026-08-25');
  });
});
