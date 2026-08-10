import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('regenerate + history', () => {
  beforeEach(() => seedApp());

  it('regenerates after confirming in the dialog and lists the old fortnight in the switcher', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(useAppStore.getState().fortnights).toHaveLength(2);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('(current)');
  });

  it('cancelling the dialog does not regenerate; focus defaults to Cancel, not Generate', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));
    const dialog = screen.getByRole('dialog', { name: 'Generate new fortnight?' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toBeInTheDocument();
    expect(useAppStore.getState().fortnights).toHaveLength(1);
  });

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-08-18' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fortnight' }), oldOption);
    expect(screen.getByText('Viewing a past fortnight (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tue, Aug 18/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
  });
});
