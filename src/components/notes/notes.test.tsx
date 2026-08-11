import { render, screen, act, within } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: 'Resolve blocker: Waiting on credentials' }));
    expect(Object.values(useAppStore.getState().notes)[0].resolved).toBe(true);
  });

  it('info notes have no Resolve button', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'info', text: 'FYI: release Friday' });
    render(<App />);
    expect(screen.getByText('FYI: release Friday')).toHaveAttribute('data-category', 'info');
    expect(screen.queryByRole('button', { name: /^Resolve blocker:/ })).not.toBeInTheDocument();
  });

  it('exposes disclosure state on Add note and manages focus in and back out', async () => {
    const user = userEvent.setup();
    render(<App />);
    const addButton = screen.getByRole('button', { name: 'Add note' });
    expect(addButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(addButton);
    expect(addButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Text')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addButton).toHaveAttribute('aria-expanded', 'false');
    expect(addButton).toHaveFocus();
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
  });

  it('gives each blocker its own unambiguous Resolve accessible name', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'Waiting on design review' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'Blocked on API keys' });
    render(<App />);

    // Ambiguous "Resolve" would throw here if both blockers shared one name.
    await user.click(screen.getByRole('button', { name: 'Resolve blocker: Blocked on API keys' }));

    const resolved = Object.values(useAppStore.getState().notes).find((n) => n.text === 'Blocked on API keys')!;
    const stillOpen = Object.values(useAppStore.getState().notes).find((n) => n.text === 'Waiting on design review')!;
    expect(resolved.resolved).toBe(true);
    expect(stillOpen.resolved).toBe(false);
  });

  it('closes a stale open Add note form when the viewed fortnight switches to read-only (regression)', async () => {
    // Repro: open "Add note" while viewing the active fortnight, then switch
    // the view to a past (read-only) fortnight without ever closing the form.
    // Previously the form kept rendering (only the *button* was gated on
    // !readOnly), so Save could still fire and produce a note with
    // fortnightId from the active fortnight's action but `day`/view context
    // from the read-only fortnight — permanently invisible on any board.
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByLabelText('Text')).toBeInTheDocument();

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    act(() => {
      useAppStore.getState().regenerateFortnight();
      useAppStore.getState().viewFortnight(oldFortnightId);
    });

    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument();
    // No note was ever created via the stale form.
    expect(Object.keys(useAppStore.getState().notes)).toHaveLength(0);
  });

  it('shows a Rolled over badge on a rolled-over blocker, even in read-only history', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'stale blocker' });
    const note = Object.values(useAppStore.getState().notes)[0];
    useAppStore.setState({ notes: { [note.id]: { ...note, rolledOver: true } } });
    render(<App />);
    const card = screen.getByText('stale blocker').closest('li')!;
    expect(within(card).getByText('Rolled over')).toBeInTheDocument();
  });

  it('does not show a Rolled over badge on a note that has never rolled over', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'fresh blocker' });
    render(<App />);
    const card = screen.getByText('fresh blocker').closest('li')!;
    expect(within(card).queryByText('Rolled over')).not.toBeInTheDocument();
  });

  it('hides mutation controls when viewing a read-only (past) fortnight', () => {
    // Seed a RESOLVED blocker note on the current (active) fortnight/day, then
    // regenerate to create a new active fortnight, leaving the original fortnight
    // (and its notes) read-only. Resolved blockers are excluded from carry-over
    // (only unresolved ones move to the new fortnight -- see carryOverNotes),
    // so this one stays behind, which is what lets this test exercise the
    // read-only guard on a real note.
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'Archived blocker' });
    const seeded = Object.values(useAppStore.getState().notes)[0];
    useAppStore.getState().resolveBlocker(seeded.id);

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);
    useAppStore.getState().selectDay('2026-08-18');

    render(<App />);

    expect(screen.getByText('Archived blocker')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve blocker: Archived blocker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete note: Archived blocker' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });
});
