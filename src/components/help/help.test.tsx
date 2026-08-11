import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

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

describe('help via App entry points', () => {
  beforeEach(() => seedApp());

  it('header Help button opens the modal on the Guide tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Monthly board');
  });

  it('? opens the modal on the Shortcuts tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('?');
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('Command palette');
  });

  it('? does not fire while typing in a text field (? is a real character)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    const title = screen.getByLabelText('Title');
    await user.type(title, 'wait, what?');
    expect(title).toHaveValue('wait, what?');
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('closes on Escape, like every other Modal', async () => {
    const user = userEvent.setup();
    render(<App />);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('still opens while viewing a read-only month (help is not a mutation)', async () => {
    const user = userEvent.setup();
    const activeId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(activeId);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
  });
});
