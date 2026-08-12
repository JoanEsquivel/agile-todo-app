import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('command palette', () => {
  beforeEach(() => seedApp());

  it('opens with Cmd/Ctrl+K from anywhere, including a text field', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    await user.type(screen.getByLabelText('Title'), 'draft'); // focus is inside a text field
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('lists actions and all 21 days by default, filters as you type', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const listbox = screen.getByRole('listbox', { name: 'Results' });

    expect(listbox).toHaveTextContent('Add todo');
    expect(listbox).toHaveTextContent('Standup');
    expect(listbox.querySelectorAll('[role="option"]').length).toBeGreaterThanOrEqual(21 + 6);

    await user.type(screen.getByRole('combobox'), 'thu');
    expect(listbox).toHaveTextContent('Go to Thu, Aug 20');
    expect(listbox).not.toHaveTextContent('Standup');
  });

  it('excludes Add todo / Add note while viewing a read-only fortnight', async () => {
    const user = userEvent.setup();
    const activeId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(activeId);
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    expect(listbox).not.toHaveTextContent('Add todo');
    expect(listbox).not.toHaveTextContent('Add note');
    expect(listbox).toHaveTextContent('Standup'); // non-mutating actions stay available
  });

  it('never lists "Generate new month" -- month transitions are automatic now', async () => {
    const user = userEvent.setup();
    // Even with the active period expired (the only state that used to
    // surface the action), the palette must not offer it.
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
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('listbox', { name: 'Results' })).not.toHaveTextContent('Generate new month');
  });

  it('finds a todo by title and jumps to its day on Enter', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'Ship the deck', priority: 'high', scheduledDay: '2026-08-19' });
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'ship the deck');
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();
  });

  it('arrow keys move the highlighted option, wrapping is not required but bounds must hold', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const combobox = screen.getByRole('combobox');
    await user.type(combobox, 'go to');

    const options = () => screen.getByRole('listbox', { name: 'Results' }).querySelectorAll('[role="option"]');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(combobox).toHaveAttribute('aria-activedescendant', options()[1].id);

    await user.keyboard('{ArrowUp}{ArrowUp}'); // one more Up than Down -- must clamp at 0, not go negative
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('running an action closes the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    // Modal doesn't aria-hide the background (see Modal.tsx), so DayColumn's
    // own "Add todo" button is still findable behind the dialog -- scope to
    // the listbox to click the palette's item, not the real page button.
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    await user.click(within(listbox).getByText('Add todo'));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('lists "Keyboard shortcuts" as an action that opens Help on the Shortcuts tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    await user.click(within(listbox).getByText('Keyboard shortcuts'));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists "Help guide" as an action that opens Help on the Guide tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    const listbox = screen.getByRole('listbox', { name: 'Results' });
    await user.click(within(listbox).getByText('Help guide'));
    expect(within(screen.getByRole('dialog', { name: 'Help' })).getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
  });
});
