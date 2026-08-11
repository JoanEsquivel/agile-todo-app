import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('App shell', () => {
  beforeEach(() => seedApp());

  it('renders the title and 10 day chips with today highlighted', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Agile Todo' })).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { name: /Aug \d+/ });
    expect(chips).toHaveLength(10);
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

  it('navigates days via chips and prev/next, clamped at the ends', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Wed, Aug 19/ }));
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();

    // clamp: click Next repeatedly beyond the last day
    for (let i = 0; i < 12; i++) await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByRole('heading', { name: /Fri, Aug 28/ })).toBeInTheDocument();
  });
});
