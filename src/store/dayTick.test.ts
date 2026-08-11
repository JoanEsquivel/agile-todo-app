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
});
