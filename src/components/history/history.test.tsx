import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

// Overwrite the seeded active fortnight (Aug 3-31, not expired against the
// mocked "today" of 2026-08-18) with a legacy July 13-24 date range,
// entirely in the past, while keeping its id so activeFortnightId /
// viewedFortnightId stay valid. Regeneration is then driven through the
// internal store action -- the UI door (button + confirm dialog) was
// removed by the three-month-window redesign.
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

describe('history', () => {
  beforeEach(() => seedApp());

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    expireActiveFortnight();
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-07-24' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    useAppStore.getState().regenerateFortnight(); // internal action -- no UI door anymore
    render(<App />);

    const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), oldOption);
    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    // Selecting the old fortnight opens on its first day (Jul 13), which
    // expands the Jul 13-17 week -- Jul 24 lives in the folded Jul 20-24
    // week and needs a click to expand before its chip exists.
    await user.click(screen.getByRole('button', { name: /^20–24 — / }));
    await user.click(screen.getByRole('button', { name: /Fri, Jul 24/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
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

    // Legacy period has no "today"; selecting it opens on days[0] (Jul 13),
    // so the week containing it (Jul 13-17) expands and the other (Jul
    // 20-24) folds -- same accordion contract as the active month.
    const dayChips = screen.getAllByRole('button', { name: /^[A-Z][a-z]{2} \d+ — / });
    expect(dayChips).toHaveLength(5);
    const weeksWrapper = screen.getByRole('navigation', { name: 'Month days' }).firstElementChild!;
    expect(weeksWrapper.children).toHaveLength(2); // one child per week, contract preserved

    const foldedWeek = screen.getByRole('button', { name: /^20–24 — / });
    await user.click(foldedWeek);
    expect(screen.getAllByRole('button', { name: /^Mon 20 — / })).toHaveLength(1);
  });
});
