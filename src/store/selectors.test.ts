import { useAppStore } from './store';
import {
  selectDayWorkload, selectIsReadOnly, selectTodosForDay, selectViewedFortnight,
} from './selectors';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('selectors', () => {
  beforeEach(() => {
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
      viewedFortnightId: null, selectedDay: null,
    });
    useAppStore.getState().initApp();
  });

  it('selectIsReadOnly is false on the active fortnight', () => {
    expect(selectIsReadOnly(useAppStore.getState())).toBe(false);
  });

  it('selectTodosForDay sorts not-done first, then priority high->low', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'low', priority: 'low', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'high', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'done-high', priority: 'high', scheduledDay: '2026-08-18' });
    const doneOne = Object.values(useAppStore.getState().todos).find((t) => t.title === 'done-high')!;
    useAppStore.getState().toggleDone(doneOne.id);

    const s = useAppStore.getState();
    const fn = selectViewedFortnight(s)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['high', 'low', 'done-high']);
  });

  describe('selectDayWorkload', () => {
    it('omits a day with no todos rather than mapping it to an empty array', () => {
      const s = useAppStore.getState();
      const fn = selectViewedFortnight(s)!;
      expect(selectDayWorkload(s, fn.id)['2026-08-18']).toBeUndefined();
    });

    it('groups mixed-priority todos under their scheduled day, done last', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'low', priority: 'low', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'high', priority: 'high', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'medium-done', priority: 'medium', scheduledDay: '2026-08-18' });
      const doneOne = Object.values(useAppStore.getState().todos).find((t) => t.title === 'medium-done')!;
      st.toggleDone(doneOne.id);
      st.addTodo({ title: 'elsewhere', priority: 'high', scheduledDay: '2026-08-19' });

      const s = useAppStore.getState();
      const fn = selectViewedFortnight(s)!;
      const workload = selectDayWorkload(s, fn.id);

      expect(workload['2026-08-18']).toEqual([
        { id: expect.any(String), priority: 'high', done: false },
        { id: expect.any(String), priority: 'low', done: false },
        { id: doneOne.id, priority: 'medium', done: true },
      ]);
      expect(workload['2026-08-19']).toHaveLength(1);
    });

    it('does not leak todos from a different fortnight scheduled on the same calendar day', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'active fortnight', priority: 'high', scheduledDay: '2026-08-18' });
      const activeFortnightId = useAppStore.getState().activeFortnightId!;

      useAppStore.setState((prev) => ({
        todos: {
          ...prev.todos,
          intruder: {
            id: 'intruder', fortnightId: 'some-other-fortnight', title: 'other fortnight',
            priority: 'high', scheduledDay: '2026-08-18', done: false,
            createdAt: '2026-08-18T00:00:00.000Z', rolledOver: false,
          },
        },
      }));

      const s = useAppStore.getState();
      const workload = selectDayWorkload(s, activeFortnightId);
      expect(workload['2026-08-18']).toHaveLength(1);
      expect(workload['2026-08-18'][0].id).not.toBe('intruder');
    });
  });
});
