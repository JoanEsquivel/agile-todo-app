import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';
import { VisitorBadge, _resetVisitorBadgeCacheForTests } from './VisitorBadge';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

beforeEach(() => {
  _resetVisitorBadgeCacheForTests();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ count: '0' }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(panel).toHaveTextContent('Checklists');
    expect(panel).toHaveTextContent('When every item is checked the todo completes itself');
    expect(panel).toHaveTextContent('Standup');
    expect(panel).toHaveTextContent('Backup & theme');
    // Placed right after the todos section, where the feature lives.
    const text = panel.textContent ?? '';
    expect(text.indexOf('Checklists')).toBeGreaterThan(text.indexOf('Todos & priorities'));
    expect(text.indexOf('Checklists')).toBeLessThan(text.indexOf('Notes: blockers & info'));
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

  it('shows the support footer with the donate link, visible from both tabs', async () => {
    const user = userEvent.setup();
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });

    const donate = within(dialog).getByRole('link', { name: 'Buy me a coffee' });
    expect(donate).toHaveAttribute('href', 'https://www.paypal.com/paypalme/joanmedia');
    expect(donate).toHaveAttribute('target', '_blank');
    expect(donate.getAttribute('rel')).toContain('noopener');
    expect(within(dialog).getByText('Enjoying the app? Support its development!')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Shortcuts' }));
    expect(within(dialog).getByRole('link', { name: 'Buy me a coffee' })).toBeInTheDocument();
    expect(within(dialog).getByText('Enjoying the app? Support its development!')).toBeInTheDocument();
  });

  it('closes on Escape via the shared Modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpModal initialTab="guide" onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('VisitorBadge', () => {
  it('renders the formatted visit count as a link to the public dashboard once loaded', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '1 234', count: '1 234' }),
    });
    render(<VisitorBadge />);
    const link = await screen.findByRole('link', { name: '1,234 visits — view public analytics' });
    expect(link).toHaveAttribute('href', 'https://agile-todo-app.goatcounter.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link).toHaveTextContent('1,234 visits');
  });

  it('calls the exact public counter endpoint', () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '5', count: '5' }),
    });
    render(<VisitorBadge />);
    expect(fetch).toHaveBeenCalledWith(
      'https://agile-todo-app.goatcounter.com/counter/TOTAL.json',
      expect.anything(),
    );
  });

  it('renders nothing when the fetch fails (adblocker/offline)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('blocked'));
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the response is a non-OK status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the response body is malformed', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ nope: true }) });
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('caches the count for the session — a second mount does not re-fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '42', count: '42' }),
    });
    const first = render(<VisitorBadge />);
    await screen.findByRole('link', { name: '42 visits — view public analytics' });
    first.unmount();

    render(<VisitorBadge />);
    expect(await screen.findByRole('link', { name: '42 visits — view public analytics' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
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
