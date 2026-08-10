import { appStorage, useAppStore } from './store';

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
      viewedFortnightId: null, selectedDay: null,
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
});
