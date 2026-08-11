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

  it('renders the title and 21 day chips (calendar month) with today highlighted', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Agile Todo' })).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { name: /Aug \d+/ });
    expect(chips).toHaveLength(21);
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
});
