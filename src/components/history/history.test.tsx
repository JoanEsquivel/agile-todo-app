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

// A hand-built legacy 10-workday fortnight (pre-redesign shape, Jul 13-24
// 2026) -- INV-4: legacy periods persist unmigrated and stay navigable.
const legacyJuly = {
  id: 'legacy-jul',
  startDay: '2026-07-13',
  days: [
    '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
    '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
  ],
  createdAt: '2026-07-13T12:00:00.000Z',
};

describe('month navigation + history', () => {
  beforeEach(() => seedApp());

  it('renders with a single month: label with "(current)", both arrows disabled (the dropdown used to hide itself)', () => {
    render(<App />);
    expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('steps one month back and forward, sorting periods chronologically whatever the array order', async () => {
    const user = userEvent.setup();
    const active = useAppStore.getState().fortnights[0];
    useAppStore.setState({ fortnights: [active, legacyJuly] }); // deliberately NOT chronological
    render(<App />);

    expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled(); // oldest bound

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
    // Returning to the current month selects TODAY (Aug 18), not day 1.
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();
  });

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    expireActiveFortnight();
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-07-24' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    useAppStore.getState().regenerateFortnight(); // internal action -- no UI door anymore
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    // Stepping to the old fortnight opens on its first day (Jul 13), which
    // expands the Jul 13-17 week -- Jul 24 lives in the folded Jul 20-24
    // week and needs a click to expand before its chip exists.
    await user.click(screen.getByRole('button', { name: /^20–24 — / }));
    await user.click(screen.getByRole('button', { name: /Fri, Jul 24/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
  });

  it('stepping months clears an open compose form (INV-9)', async () => {
    const user = userEvent.setup();
    const active = useAppStore.getState().fortnights[0];
    useAppStore.setState({ fortnights: [legacyJuly, active] });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('mixed history: a legacy 10-day fortnight coexists with the active calendar month', async () => {
    const user = userEvent.setup();
    const active = useAppStore.getState().fortnights[0];
    useAppStore.setState({ fortnights: [legacyJuly, active] });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));

    // Legacy period has no "today"; stepping to it opens on days[0] (Jul
    // 13), so the week containing it (Jul 13-17) expands and the other
    // (Jul 20-24) folds -- same accordion contract as the active month.
    const dayChips = screen.getAllByRole('button', { name: /^[A-Z][a-z]{2} \d+ — / });
    expect(dayChips).toHaveLength(5);
    const weeksWrapper = screen.getByRole('navigation', { name: 'Month days' }).firstElementChild!;
    expect(weeksWrapper.children).toHaveLength(2); // one child per week, contract preserved

    const foldedWeek = screen.getByRole('button', { name: /^20–24 — / });
    await user.click(foldedWeek);
    expect(screen.getAllByRole('button', { name: /^Mon 20 — / })).toHaveLength(1);
  });
});
