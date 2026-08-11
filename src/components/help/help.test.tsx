import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('HelpModal', () => {
  it('opens on the Guide tab and lists the feature guide', () => {
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'false');
    const panel = within(dialog).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Monthly board');
    expect(panel).toHaveTextContent('Automatic rollover');
    expect(panel).toHaveTextContent('Month history');
    expect(panel).toHaveTextContent('Standup');
    expect(panel).toHaveTextContent('Backup & theme');
  });

  it('opens directly on the Shortcuts tab when initialTab is shortcuts', () => {
    render(<HelpModal initialTab="shortcuts" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
    const panel = within(dialog).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Command palette');
    expect(panel).toHaveTextContent('Open this help');
    expect(panel).toHaveTextContent('Jump to today');
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    expect(screen.getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Command palette');
  });

  it('moves tab selection and focus with arrow keys inside the tablist', async () => {
    const user = userEvent.setup();
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Guide' }));
    await user.keyboard('{ArrowRight}');
    const shortcutsTab = screen.getByRole('tab', { name: 'Shortcuts' });
    expect(shortcutsTab).toHaveAttribute('aria-selected', 'true');
    expect(shortcutsTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps exactly one tab in the tab order (roving tabindex)', () => {
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Guide' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('tabindex', '-1');
  });

  it('closes on Escape via the shared Modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpModal initialTab="guide" onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
