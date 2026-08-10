import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('notes on the board', () => {
  beforeEach(() => seedApp());

  it('adds a blocker note and resolves it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByLabelText('Text'), 'Waiting on credentials');
    await user.selectOptions(screen.getByLabelText('Category'), 'blocker');
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    const card = screen.getByText('Waiting on credentials');
    expect(card).toHaveAttribute('data-category', 'blocker');

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(Object.values(useAppStore.getState().notes)[0].resolved).toBe(true);
  });

  it('info notes have no Resolve button', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'info', text: 'FYI: release Friday' });
    render(<App />);
    expect(screen.getByText('FYI: release Friday')).toHaveAttribute('data-category', 'info');
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });

  it('hides mutation controls when viewing a read-only (past) fortnight', () => {
    // Seed an unresolved blocker note on the current (active) fortnight/day, then
    // regenerate to create a new active fortnight, leaving the original fortnight
    // (and its notes) read-only.
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'Archived blocker' });

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);
    useAppStore.getState().selectDay('2026-08-18');

    render(<App />);

    expect(screen.getByText('Archived blocker')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete note: Archived blocker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });
});
