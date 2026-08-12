import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';
import { useAppStore } from './store/store';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('App shell', () => {
  beforeEach(() => seedApp());

  it('renders the title, the selected week expanded, the rest folded, with today highlighted', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Agile Todo' })).toBeInTheDocument();
    const dayChips = screen.getAllByRole('button', { name: /^[A-Z][a-z]{2} \d+ — / });
    expect(dayChips).toHaveLength(5); // the week containing today (Aug 17-21)
    const foldedWeeks = screen.getAllByRole('button', { name: /^\d/ });
    expect(foldedWeeks).toHaveLength(4); // the other 4 weeks of the month
    expect(screen.getByRole('button', { name: /Tue, Aug 18/ })).toHaveAttribute('data-today');
  });

  it('credits the author with LinkedIn and source-code links in the header', () => {
    render(<App />);
    const linkedin = screen.getByRole('link', { name: 'Joan Esquivel on LinkedIn' });
    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/joanesquivel/');
    expect(linkedin).toHaveAttribute('target', '_blank');
    expect(linkedin.getAttribute('rel')).toContain('noopener');

    const source = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(source).toHaveAttribute('href', 'https://github.com/JoanEsquivel/agile-todo-app');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source.getAttribute('rel')).toContain('noopener');
  });

  it('renders the donate pill in the header, after the source-code link', () => {
    render(<App />);
    const donate = screen.getByRole('link', { name: 'Buy me a coffee' });
    expect(donate).toHaveAttribute('href', 'https://www.paypal.com/paypalme/joanmedia');
    expect(donate).toHaveAttribute('target', '_blank');
    expect(donate.getAttribute('rel')).toContain('noopener');

    const source = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(source.compareDocumentPosition(donate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cycles the theme toggle through system, light, and dark', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Theme: system' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Theme: light' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    // Back to system: attribute and stored key are both cleared.
    await user.click(screen.getByRole('button', { name: 'Theme: dark' }));
    expect(screen.getByRole('button', { name: 'Theme: system' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('agile-todo-app.theme')).toBeNull();
  });

  it('navigates days via chips', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Wed, Aug 19/ }));
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Tue, Aug 18/ }));
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();
  });

  it('clicking a folded week expands it and navigates to its first day', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^24–28 — / }));
    expect(screen.getByRole('heading', { name: /Mon, Aug 24/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mon 24 — / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^17–21 — / })).toBeInTheDocument();
  });

  it('shows a progress indicator for the active fortnight, but not for a past one', () => {
    const { unmount } = render(<App />);
    // Today (Aug 18) is the 12th of the 21 workdays in August 2026.
    expect(screen.getByText('Day 12 of 21')).toBeInTheDocument();
    unmount();

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);

    render(<App />);
    expect(screen.queryByText(/Day \d+ of/)).not.toBeInTheDocument();
  });

  it('an expired active month renders no banner and no Generate button -- month transitions are automatic now', () => {
    // Expire the active period in place (legacy July range, id preserved).
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
    render(<App />);
    expect(screen.queryByText(/This month has ended/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate new month' })).not.toBeInTheDocument();
  });
});
