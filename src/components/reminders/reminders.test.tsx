import { render, screen, act, within, fireEvent } from '@testing-library/react';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('reminders panel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 7, 18, 12, 0) });
    seedApp();
  });
  afterEach(() => vi.useRealTimers());

  it('lists overdue and upcoming reminders', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'Late', priority: 'high', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T09:00' });
    st.addTodo({ title: 'Soon', priority: 'low', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T15:00' });
    render(<App />);
    const panel = screen.getByRole('complementary', { name: 'Reminders' });
    expect(panel).toHaveTextContent('Overdue');
    expect(panel).toHaveTextContent('Late');
    expect(panel).toHaveTextContent('Upcoming');
    expect(panel).toHaveTextContent('Soon');
  });

  it('clicking a reminder while viewing a past fortnight switches back to the active one (regression)', () => {
    // Reminders always come from active-fortnight todos. Previously, picking
    // a reminder only called selectDay(), so if the user was viewing a past
    // (read-only) fortnight, selectedDay ended up pointing at a day outside
    // the *viewed* fortnight's day range -> broken board (no day selected,
    // heading for a day the viewed fortnight doesn't contain).
    const st = useAppStore.getState();
    st.addTodo({ title: 'Late', priority: 'high', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T09:00' });
    const activeId = useAppStore.getState().activeFortnightId!;

    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(activeId); // now viewing the old (read-only) fortnight

    render(<App />);
    expect(useAppStore.getState().viewedFortnightId).toBe(activeId);
    expect(useAppStore.getState().viewedFortnightId).not.toBe(useAppStore.getState().activeFortnightId);

    const panel = screen.getByRole('complementary', { name: 'Reminders' });
    const button = within(panel).getByText('Late').closest('button')!;
    fireEvent.click(button);

    const s = useAppStore.getState();
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).toBe('2026-08-18');
  });

  it('moves an upcoming reminder to overdue as time passes', () => {
    useAppStore.getState().addTodo({
      title: 'Soon', priority: 'low', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T12:15',
    });
    render(<App />);
    const panel = screen.getByRole('complementary', { name: 'Reminders' });
    expect(panel).toHaveTextContent('Upcoming');
    act(() => vi.advanceTimersByTime(16 * 60 * 1000)); // 16 minutes
    expect(panel).toHaveTextContent('Overdue');
  });
});
