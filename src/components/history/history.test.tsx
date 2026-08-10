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

  it('regenerates after confirm and lists the old fortnight in the switcher', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));
    expect(useAppStore.getState().fortnights).toHaveLength(2);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('(current)');
  });

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-08-18' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));

    const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fortnight' }), oldOption);
    expect(screen.getByText('Viewing a past fortnight (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tue, Aug 18/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
  });
});
