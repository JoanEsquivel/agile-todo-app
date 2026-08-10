import { useAppStore } from '../store/store';

export function seedApp() {
  localStorage.clear();
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
  useAppStore.getState().initApp();
  return useAppStore.getState();
}
