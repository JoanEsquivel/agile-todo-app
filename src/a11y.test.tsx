import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('keyboard navigation', () => {
  beforeEach(() => seedApp());

  it('arrow keys move the selected day on the strip', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('navigation', { name: 'Fortnight days' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('heading', { name: /Mon, Aug 17/ })).toBeInTheDocument();
  });

  it('modal moves focus in and restores it on close', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Standup' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Daily standup' })).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
