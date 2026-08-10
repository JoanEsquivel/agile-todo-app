import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('standup modal', () => {
  beforeEach(() => {
    seedApp();
    const st = useAppStore.getState();
    st.addTodo({ title: 'Done yesterday', priority: 'medium', scheduledDay: '2026-08-17' });
    const done = Object.values(useAppStore.getState().todos)[0];
    useAppStore.setState((s) => ({
      todos: {
        ...s.todos,
        [done.id]: { ...done, done: true, completedAt: new Date(2026, 7, 17, 16, 0).toISOString() },
      },
    }));
    useAppStore.getState().addTodo({ title: 'For today', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'API down' });
  });

  it('shows yesterday, today and blockers', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    const dialog = screen.getByRole('dialog', { name: 'Daily standup' });
    expect(dialog).toHaveTextContent('Done yesterday');
    expect(dialog).toHaveTextContent('For today');
    expect(dialog).toHaveTextContent('API down');
  });

  it('copies the formatted standup to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(writeText).toHaveBeenCalledWith(
      '*Yesterday*\n- Done yesterday\n\n*Today*\n- For today\n\n*Blockers*\n- API down',
    );
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('strikes through a today todo that is already done', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'Done today', priority: 'low', scheduledDay: '2026-08-18' });
    const doneToday = Object.values(useAppStore.getState().todos).find((t) => t.title === 'Done today')!;
    useAppStore.setState((s) => ({
      todos: {
        ...s.todos,
        [doneToday.id]: { ...doneToday, done: true, completedAt: new Date(2026, 7, 18, 9, 0).toISOString() },
      },
    }));
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    const dialog = screen.getByRole('dialog', { name: 'Daily standup' });
    const struck = dialog.querySelectorAll('s');
    const struckTitles = Array.from(struck).map((el) => el.textContent);
    expect(struckTitles).toContain('Done today');
    // The not-done today item must NOT be struck through.
    expect(Array.from(struck).some((el) => el.textContent === 'For today')).toBe(false);
  });
});
