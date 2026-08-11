import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('skip link', () => {
  beforeEach(() => seedApp());

  it('is the first focusable element and targets #main', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')?.tagName).toBe('MAIN');
  });
});

describe('fortnight tape: roving tabindex', () => {
  beforeEach(() => seedApp());

  it('is exactly one tab stop, not thirteen', async () => {
    // The old chip strip was a focusable <nav> plus prev + N chips + next
    // -- N+3 consecutive stops. The tape must be exactly one: whichever day
    // button is selected, every other day button is tabIndex=-1.
    render(<App />);
    const dayButtons = screen.getAllByRole('button', { name: /Aug \d+/ });
    expect(dayButtons).toHaveLength(21);
    const tabbable = dayButtons.filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    // The chip's visible text is now the compact "Tue 18"; the full label
    // lives in the accessible name (aria-label) instead — see FortnightTape.
    expect(tabbable[0]).toHaveAccessibleName(/Tue, Aug 18/); // seedApp's selected day
  });

  it('arrows move both focus and selection together, and the tab stop follows', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('button', { name: /Tue, Aug 18/ }).focus();

    await user.keyboard('{ArrowRight}');
    const wed = screen.getByRole('button', { name: /Wed, Aug 19/ });
    expect(wed).toHaveFocus();
    expect(wed).toHaveAttribute('tabIndex', '0');
    expect(screen.getByRole('button', { name: /Tue, Aug 18/ })).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('button', { name: /Mon, Aug 17/ })).toHaveFocus();
    expect(screen.getByRole('heading', { name: /Mon, Aug 17/ })).toBeInTheDocument();
  });

  it('Home and End jump to the first and last day of the month', async () => {
    // Anchored names: with 21 days the month has both Aug 3 and Aug 31, and
    // an unanchored /Aug 3/ would match both -- see task-3 brief.
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('button', { name: /Tue, Aug 18/ }).focus();

    await user.keyboard('{End}');
    expect(screen.getByRole('heading', { name: /^Mon, Aug 31$/ })).toBeInTheDocument();
    // The button's accessible name is now "Mon 31 -- Mon, Aug 31" (see
    // FortnightTape's WCAG 2.5.3 fix) -- still anchored so it can't also
    // match "Mon 3 -- Mon, Aug 3".
    expect(screen.getByRole('button', { name: /^Mon 31 — Mon, Aug 31$/ })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('heading', { name: /^Mon, Aug 3$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mon 3 — Mon, Aug 3$/ })).toHaveFocus();
  });
});

describe('keyboard navigation', () => {
  beforeEach(() => seedApp());

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

describe('Modal hardening', () => {
  beforeEach(() => seedApp());

  it('portals to document.body, names itself via aria-labelledby, and locks the app underneath', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));

    const dialog = screen.getByRole('dialog', { name: 'Daily standup' });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).not.toHaveAttribute('aria-label');

    expect(container).toHaveProperty('inert', true);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(container).toHaveProperty('inert', false);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on a scrim click but not on a click inside the dialog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    const dialog = screen.getByRole('dialog', { name: 'Daily standup' });

    await user.click(screen.getByRole('heading', { name: 'Daily standup' }));
    expect(screen.getByRole('dialog', { name: 'Daily standup' })).toBeInTheDocument();

    await user.click(dialog.parentElement!); // the overlay/scrim itself
    expect(screen.queryByRole('dialog', { name: 'Daily standup' })).not.toBeInTheDocument();
  });
});

describe('Announcer', () => {
  beforeEach(() => seedApp());

  it('announces adding and deleting a todo', async () => {
    const user = userEvent.setup();
    render(<App />);
    const live = screen.getByRole('status', { name: 'Announcements' });

    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    await user.type(screen.getByLabelText('Title'), 'Ship it');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(live).toHaveTextContent('Added todo: Ship it');

    await user.click(screen.getByRole('button', { name: 'Delete todo: Ship it' }));
    expect(live).toHaveTextContent('Deleted todo: Ship it');
  });

  it('announces the selected day when navigating the tape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const live = screen.getByRole('status', { name: 'Announcements' });
    screen.getByRole('button', { name: /Tue, Aug 18/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(live).toHaveTextContent('Wed, Aug 19');
  });

  it('announces a clipboard copy with text distinct from the visible button label', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App />);
    const live = screen.getByRole('status', { name: 'Announcements' });

    await user.click(screen.getByRole('button', { name: 'Standup' }));
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(live).toHaveTextContent('Standup copied to clipboard');
  });

  it('stays outside the inert lock while a modal is open', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    const live = screen.getByRole('status', { name: 'Announcements' });
    // Modal's lock skips this element entirely (see Modal.tsx's
    // data-live-region filter) -- its `inert` is never touched at all,
    // not toggled to false, which is exactly what proves it was excluded.
    expect((live as HTMLElement & { inert: boolean }).inert).not.toBe(true);
  });
});
