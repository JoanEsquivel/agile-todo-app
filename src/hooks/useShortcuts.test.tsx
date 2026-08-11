import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { seedApp } from '../test/seed';
import { useAppStore } from '../store/store';

vi.mock('../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

// document.body.focus() is a no-op -- <body> isn't natively focusable, so
// whatever previously held focus would keep it. Blurring the actually-
// focused element is what genuinely moves focus off a typing target.
function blur() {
  (document.activeElement as HTMLElement | null)?.blur();
}

describe('useShortcuts', () => {
  beforeEach(() => seedApp());

  it('S opens Standup from anywhere (focus on body)', async () => {
    const user = userEvent.setup();
    render(<App />);
    blur();
    await user.keyboard('s');
    expect(screen.getByRole('dialog', { name: 'Daily standup' })).toBeInTheDocument();
  });

  it('P opens the pomodoro modal, but not while typing or over another dialog', async () => {
    const user = userEvent.setup();
    render(<App />);
    blur();

    // Dead in a text input: N opens the todo form and focuses Title.
    await user.keyboard('n');
    await user.keyboard('p');
    expect(screen.queryByRole('dialog', { name: 'Pomodoro' })).not.toBeInTheDocument();
    blur();
    await user.keyboard('{Escape}');

    // Dead while another dialog is open.
    await user.keyboard('s');
    expect(screen.getByRole('dialog', { name: 'Daily standup' })).toBeInTheDocument();
    await user.keyboard('p');
    expect(screen.queryByRole('dialog', { name: 'Pomodoro' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.keyboard('p');
    expect(screen.getByRole('dialog', { name: 'Pomodoro' })).toBeInTheDocument();
  });

  it('N opens the todo form, Shift+N opens the note form', async () => {
    const user = userEvent.setup();
    render(<App />);
    blur();
    await user.keyboard('n');
    expect(screen.getByLabelText('Title')).toBeInTheDocument();

    // Autofocus landed in the Title field (a typing target) -- move focus
    // back out before the next shortcut, or "N" would just type into it.
    blur();
    // Only one compose form at a time -- Shift+N switches, it doesn't stack.
    await user.keyboard('{Shift>}n{/Shift}');
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
  });

  it('N and Shift+N are refused while viewing a read-only (past) fortnight', async () => {
    const user = userEvent.setup();
    const activeId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(activeId); // now viewing the old, read-only fortnight
    render(<App />);
    blur();

    await user.keyboard('n');
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    await user.keyboard('{Shift>}n{/Shift}');
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    expect(useAppStore.getState().composeIntent).toBeNull();
  });

  it('arrow keys move the selected day even when focus is nowhere near the tape', async () => {
    const user = userEvent.setup();
    render(<App />);
    blur();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();
  });

  it('does not double-move when focus is already on a tape day button', async () => {
    // The tape's own onKeyDown already moves the day and calls
    // preventDefault(); this hook must see e.defaultPrevented and skip,
    // or a single ArrowRight would advance two days instead of one.
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('button', { name: /Tue, Aug 18/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Thu, Aug 20/ })).not.toBeInTheDocument();
  });

  it('T jumps to today, switching back from a read-only fortnight if needed', async () => {
    const user = userEvent.setup();
    const activeId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(activeId);
    render(<App />);
    expect(useAppStore.getState().viewedFortnightId).not.toBe(useAppStore.getState().activeFortnightId);

    blur();
    await user.keyboard('t');
    const s = useAppStore.getState();
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    expect(s.selectedDay).toBe('2026-08-18');
  });

  it('every shortcut no-ops while typing in a text field', async () => {
    const user = userEvent.setup();
    render(<App />);
    blur();
    await user.keyboard('n'); // open the todo form first
    const title = screen.getByLabelText('Title');
    expect(title).toHaveFocus();

    await user.type(title, 'note about nsync'); // contains n, s, t -- must not fire any shortcut
    expect(title).toHaveValue('note about nsync');
    expect(screen.queryByRole('dialog', { name: 'Daily standup' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();
  });

  it('bails while a dialog is open', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    // Focus is trapped inside the dialog; arrow keys must not change the
    // board's selected day behind it.
    await user.keyboard('{ArrowRight}');
    expect(useAppStore.getState().selectedDay).toBe('2026-08-18');
  });
});
