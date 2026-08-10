import { render, act } from '@testing-library/react';
import App from '../App';
import { seedApp } from '../test/seed';
import { useAppStore } from '../store/store';

const clock = { today: '2026-08-18' };
vi.mock('../store/clock', () => ({
  todayLocal: () => clock.today,
  nowIso: () => `${clock.today}T12:00:00.000Z`,
}));

describe('useDayChangeWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clock.today = '2026-08-18';
    seedApp();
  });
  afterEach(() => vi.useRealTimers());

  it('rolls over when the interval ticks past midnight', () => {
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    render(<App />);
    clock.today = '2026-08-19';
    act(() => vi.advanceTimersByTime(60_000));
    expect(Object.values(useAppStore.getState().todos)[0].scheduledDay).toBe('2026-08-19');
  });

  it('rolls over on visibilitychange', () => {
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    render(<App />);
    clock.today = '2026-08-19';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(Object.values(useAppStore.getState().todos)[0].scheduledDay).toBe('2026-08-19');
  });
});
