import { useAppStore } from '../store/store';
import { SCHEMA_VERSION } from '../store/migrations';
import { DEFAULT_POMODORO_SETTINGS } from '../domain/pomodoro';

export function seedApp() {
  localStorage.clear();
  useAppStore.setState({
    schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    pomodoroSettings: DEFAULT_POMODORO_SETTINGS, pomodoro: null,
    viewedFortnightId: null, selectedDay: null, composeIntent: null,
  });
  useAppStore.getState().initApp();
  return useAppStore.getState();
}
