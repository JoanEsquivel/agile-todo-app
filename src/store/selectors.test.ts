import { useAppStore } from './store';
import {
  selectIsReadOnly, selectTodosForDay, selectViewedFortnight,
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
});
