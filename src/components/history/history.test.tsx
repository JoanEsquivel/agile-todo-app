import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

// The "Generate new month" button/action is disabled until the active period
// has actually ended (see App.tsx) -- clicking it mid-month would create a
// second period covering the same date range as the active one. These tests
// exercise the regenerate flow itself, so they need an already-expired
// active period first. Overwrite the seeded active fortnight (still Aug
// 3-31, not expired against the mocked "today" of 2026-08-18) with a legacy
// July 13-24 date range, entirely in the past, while keeping its id so
// activeFortnightId/viewedFortnightId stay valid.
function expireActiveFortnight() {
  const activeId = useAppStore.getState().activeFortnightId!;
  const days = [
    '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
    '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
  ];
  useAppStore.setState({
    fortnights: useAppStore.getState().fortnights.map((f) =>
      f.id === activeId ? { ...f, startDay: days[0], days } : f,
    ),
  });
}

describe('regenerate + history', () => {
  beforeEach(() => seedApp());

  it('regenerates after confirming in the dialog and lists the old fortnight in the switcher', async () => {
    expireActiveFortnight();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new month' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(useAppStore.getState().fortnights).toHaveLength(2);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('(current)');
  });

  it('cancelling the dialog does not regenerate; focus defaults to Cancel, not Generate', async () => {
    expireActiveFortnight();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new month' }));
    const dialog = screen.getByRole('dialog', { name: 'Generate new month?' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toBeInTheDocument();
    expect(useAppStore.getState().fortnights).toHaveLength(1);
  });

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    expireActiveFortnight();
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-07-24' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new month' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), oldOption);
    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Fri, Jul 24/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
  });

  it('the "Generate new month" button is disabled while the active period has not ended (default fixture)', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Generate new month' })).toBeDisabled();
  });

  it('the "Generate new month" button is enabled once the active period has ended', () => {
    expireActiveFortnight();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Generate new month' })).not.toBeDisabled();
  });

  it('mixed history: a legacy 10-day fortnight coexists with the active calendar month', async () => {
    // Simulates history from before the monthly-board redesign: a hand-built
    // 10-workday legacy fortnight (Jul 13-24 2026) sitting alongside the
    // active calendar-month period seedApp() just created (Aug 3-31 2026).
    const user = userEvent.setup();
    const active = useAppStore.getState().fortnights[0];
    const legacy = {
      id: 'legacy-jul',
      startDay: '2026-07-13',
      days: [
        '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
        '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
      ],
      createdAt: '2026-07-13T12:00:00.000Z',
    };
    useAppStore.setState({ fortnights: [legacy, active] });
    render(<App />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual([
      'Mon, Aug 3 – Mon, Aug 31 (current)',
      'Mon, Jul 13 – Fri, Jul 24',
    ]);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), legacy.id);
    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();

    const chips = screen.getAllByRole('button', { name: /Jul \d+/ });
    expect(chips).toHaveLength(10);
    const weeksWrapper = screen.getByRole('navigation', { name: 'Month days' }).firstElementChild!;
    expect(weeksWrapper.children).toHaveLength(2);
  });
});
