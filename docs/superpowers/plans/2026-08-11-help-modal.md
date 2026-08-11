# Help Modal + Header Info Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ⓘ Help button to the header that opens a unified Help modal (Guide + Shortcuts tabs), absorbing and deleting the existing `ShortcutsOverlay`.

**Architecture:** New feature folder `src/components/help/` with two dumb components (`HelpButton`, `HelpModal`) wired into `App.tsx` via one local state value `helpOpen: 'guide' | 'shortcuts' | null` that encodes both "open?" and the initial tab. No domain, store, or persistence changes. Spec: [`docs/superpowers/specs/2026-08-11-help-modal-design.md`](../specs/2026-08-11-help-modal-design.md).

**Tech Stack:** React 19 + TypeScript strict, CSS Modules with `tokens.css` custom properties, Vitest + React Testing Library (globals on).

## Global Constraints

- Work on a feature branch (e.g. `feat/help-modal`) — **never commit to or push `main`** (pushing deploys).
- `npm run verify` (typecheck + 334-test suite) green after every task. Never `npx tsc --noEmit` (checks zero files — CLAUDE.md).
- Vitest globals: never `import { describe, it, expect, vi } from 'vitest'`.
- Mock the clock by mocking the module (`vi.mock('../../store/clock', ...)`), never `vi.setSystemTime` (INV-10).
- Queries by role/label only; no test-ids; no new `data-*` attributes (INV-13).
- All colors/spacing/radii from `src/styles/tokens.css` tokens — no hard-coded hex/rgb in `.module.css` (INV-12); one colocated `.module.css` per component, no `composes:`/`:global`.
- All user-visible copy in English and says "month", never "fortnight".
- No new runtime dependencies (set stays `react`, `react-dom`, `zustand`).
- No ambient time (`new Date()`/`Date.now()`) anywhere in this feature (INV-2).

---

### Task 1: `HelpModal` component

**Files:**
- Create: `src/components/help/HelpModal.tsx`
- Create: `src/components/help/HelpModal.module.css`
- Create: `src/components/help/help.test.tsx`

**Interfaces:**
- Consumes: `Modal` from `src/components/common/Modal.tsx` — `Modal({ title: string, onClose: () => void, children })`; supplies `role=dialog`, Escape + backdrop close, focus trap.
- Produces: `HelpModal({ initialTab, onClose }: { initialTab: HelpTab; onClose: () => void })` and `export type HelpTab = 'guide' | 'shortcuts'` — Task 2 imports both from `'./components/help/HelpModal'`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/help-modal
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/help/help.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: FAIL — cannot resolve `./HelpModal`.

- [ ] **Step 4: Implement `HelpModal`**

Create `src/components/help/HelpModal.tsx`:

```tsx
import { useId, useState } from 'react';
import { Modal } from '../common/Modal';
import styles from './HelpModal.module.css';

export type HelpTab = 'guide' | 'shortcuts';

// Guide copy is spec-final (docs/superpowers/specs/2026-08-11-help-modal-design.md §4):
// every claim must stay verifiable app behavior.
const GUIDE_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Monthly board',
    body: 'The board shows the workdays (Mon–Fri) of the current month. Move between days with ← →, or press T to jump to today.',
  },
  {
    title: 'Automatic rollover',
    body: 'When a new day starts, unfinished todos move forward to today and are marked as rolled over. Completed todos stay on the day you finished them.',
  },
  {
    title: 'Month history',
    body: 'When a month ends, the next one is generated automatically. Use the ‹ › stepper to revisit the two previous months — past months are read-only.',
  },
  {
    title: 'Todos & priorities',
    body: 'Press N to add a todo to the selected day, with high, medium or low priority. Click the checkbox to mark it done.',
  },
  {
    title: 'Notes: blockers & info',
    body: 'Press Shift+N to add a note. Unresolved blockers follow you from day to day and appear in the standup until you resolve them; info notes stay where you put them.',
  },
  {
    title: 'Standup',
    body: 'Press S for a summary of yesterday, today and open blockers, ready to copy for your standup.',
  },
  {
    title: 'Pomodoro',
    body: 'The header timer runs focus and break sessions; press P to configure durations. Settings are saved between visits.',
  },
  {
    title: 'Backup & theme',
    body: 'Export downloads your whole board as a JSON file; Import restores it. The sun/moon button switches between light, dark and system theme.',
  },
];

// Migrated verbatim from the deleted ShortcutsOverlay, except the `?` row
// ("Show this overlay" → "Open this help").
const SHORTCUTS: Array<{ combo: string[]; description: string }> = [
  { combo: ['⌘', 'K'], description: 'Command palette (also Ctrl+K)' },
  { combo: ['?'], description: 'Open this help' },
  { combo: ['←', '→'], description: 'Previous / next day' },
  { combo: ['Home'], description: 'First day of the month' },
  { combo: ['End'], description: 'Last day of the month' },
  { combo: ['T'], description: 'Jump to today' },
  { combo: ['N'], description: 'New todo' },
  { combo: ['⇧', 'N'], description: 'New note' },
  { combo: ['S'], description: 'Standup' },
  { combo: ['P'], description: 'Pomodoro timer' },
  { combo: ['Esc'], description: 'Close the open form or dialog' },
];

const TABS: Array<{ id: HelpTab; label: string }> = [
  { id: 'guide', label: 'Guide' },
  { id: 'shortcuts', label: 'Shortcuts' },
];

export function HelpModal({ initialTab, onClose }: { initialTab: HelpTab; onClose: () => void }) {
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const baseId = useId();

  // With two tabs, either arrow key means "the other one". The global ←/→
  // day-navigation shortcuts can't collide: useShortcuts bails while any
  // [role=dialog] is mounted.
  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: HelpTab = tab === 'guide' ? 'shortcuts' : 'guide';
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <Modal title="Help" onClose={onClose}>
      <div className={styles.tabs} role="tablist" aria-label="Help sections" onKeyDown={onTablistKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            id={`${baseId}-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'guide' ? (
        <div
          id={`${baseId}-panel-guide`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-guide`}
          className={styles.panel}
        >
          <dl className={styles.guide}>
            {GUIDE_SECTIONS.map((s) => (
              <div key={s.title} className={styles.guideEntry}>
                <dt className={styles.guideTitle}>{s.title}</dt>
                <dd className={styles.guideBody}>{s.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div
          id={`${baseId}-panel-shortcuts`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-shortcuts`}
          className={styles.panel}
        >
          <ul className={styles.list}>
            {SHORTCUTS.map((s) => (
              <li key={s.description} className={styles.row}>
                <span className={styles.combo}>
                  {s.combo.map((k, i) => (
                    <kbd key={i} className={styles.key}>{k}</kbd>
                  ))}
                </span>
                <span className={styles.description}>{s.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
```

Create `src/components/help/HelpModal.module.css` (the `.list`/`.row`/`.combo`/`.key`/`.description` block is copied from the soon-to-be-deleted `ShortcutsOverlay.module.css`):

```css
.tabs {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.tab {
  padding: var(--space-1) var(--space-3);
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--color-text);
}

.tab[aria-selected='true'] {
  color: var(--color-text);
  font-weight: 600;
  border-bottom-color: var(--color-ink);
}

.panel {
  max-height: 60vh;
  overflow-y: auto;
}

.guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.guideTitle {
  font-weight: 600;
}

.guideBody {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.combo {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-1);
  min-width: 5rem;
}

.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
}

.description {
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: 6 tests PASS.

- [ ] **Step 6: Verify and commit**

Run: `npm run verify`
Expected: typecheck clean, full suite green (334 existing + 6 new).

```bash
git add src/components/help/
git commit -m "feat: HelpModal with Guide and Shortcuts tabs"
```

---

### Task 2: `HelpButton`, App wiring, delete `ShortcutsOverlay`

**Files:**
- Create: `src/components/help/HelpButton.tsx`
- Create: `src/components/help/HelpButton.module.css`
- Modify: `src/App.tsx` (state `shortcutsOpen` → `helpOpen`, header button, palette actions, imports)
- Modify: `src/hooks/useShortcuts.ts:30-35` (rename `onOpenShortcutsOverlay` → `onOpenHelp`) and its doc comment at lines 13-17
- Modify: `src/components/commands/commands.test.tsx` (retarget one palette test, add one, delete the `shortcuts overlay` describe block)
- Modify: `src/components/help/help.test.tsx` (add App-level integration describe)
- Delete: `src/components/commands/ShortcutsOverlay.tsx`, `src/components/commands/ShortcutsOverlay.module.css`

**Interfaces:**
- Consumes: `HelpModal` + `HelpTab` from Task 1.
- Produces: `HelpButton({ onClick }: { onClick: () => void })`; `useShortcuts`'s options object now has `onOpenHelp: () => void` in place of `onOpenShortcutsOverlay`.

- [ ] **Step 1: Write the failing App-level tests**

Append to `src/components/help/help.test.tsx` (add these imports at the top: `import App from '../../App';`, `import { seedApp } from '../../test/seed';`, `import { useAppStore } from '../../store/store';`):

```tsx
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
```

In `src/components/commands/commands.test.tsx`:

1. Replace the whole test `'lists "Keyboard shortcuts" as an action that opens the overlay'` (lines 114-122) with:

```tsx
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
```

2. Delete the entire `describe('shortcuts overlay', ...)` block (lines 125-158) — those three behaviors now live in `help.test.tsx` (the `?`-typing guard and Escape tests above are their direct migrations).

3. The palette action-count assertion at line 32 (`21 + 4`) counts one more action now — change to `21 + 5`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/help/help.test.tsx src/components/commands/commands.test.tsx`
Expected: the new App-level tests FAIL (no button named Help; `?` still opens a dialog named "Keyboard shortcuts").

- [ ] **Step 3: Implement `HelpButton`, rewire App and useShortcuts, delete the overlay**

Create `src/components/help/HelpButton.tsx`:

```tsx
import styles from './HelpButton.module.css';

/** Header ⓘ button. Dumb on purpose: App owns the modal state, the same
 *  split as PomodoroWidget's onOpenModal. */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Help"
      title="Help — guide & keyboard shortcuts"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
        <path d="M8 7.2v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
```

Create `src/components/help/HelpButton.module.css` (mirrors `ThemeToggle.module.css` so the two sit as visual siblings):

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.button:hover {
  color: var(--color-text);
  background: var(--color-surface-hover);
}

.button svg {
  width: 1rem;
  height: 1rem;
}
```

In `src/hooks/useShortcuts.ts`:
- Line 30-34: rename the option `onOpenShortcutsOverlay` → `onOpenHelp` (in both the destructuring and the type).
- Line 57: `onOpenShortcutsOverlay()` → `onOpenHelp()`.
- Line 122: update the dependency array name.
- Doc comment lines 14-15: "? opens the shortcuts overlay" → "? opens the Help modal on its Shortcuts tab".

In `src/App.tsx`:
- Replace the import of `ShortcutsOverlay` with:

```tsx
import { HelpButton } from './components/help/HelpButton';
import { HelpModal, type HelpTab } from './components/help/HelpModal';
```

- Replace `const [shortcutsOpen, setShortcutsOpen] = useState(false);` with:

```tsx
const [helpOpen, setHelpOpen] = useState<HelpTab | null>(null);
```

- In the `useShortcuts` call, replace `onOpenShortcutsOverlay: () => setShortcutsOpen(true),` with `onOpenHelp: () => setHelpOpen('shortcuts'),`.
- In `paletteActions`, replace the `keyboard-shortcuts` entry with:

```tsx
    { id: 'help-guide', label: 'Help guide', run: () => setHelpOpen('guide') },
    { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', run: () => setHelpOpen('shortcuts') },
```

- In the header, insert `<HelpButton onClick={() => setHelpOpen('guide')} />` on its own line immediately before `<ThemeToggle />`.
- Replace `{shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}` with:

```tsx
{helpOpen && <HelpModal initialTab={helpOpen} onClose={() => setHelpOpen(null)} />}
```

Delete the overlay:

```bash
git rm src/components/commands/ShortcutsOverlay.tsx src/components/commands/ShortcutsOverlay.module.css
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/help/help.test.tsx src/components/commands/commands.test.tsx src/hooks/useShortcuts.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Full verify and commit**

Run: `npm run verify`
Expected: typecheck clean, whole suite green.

```bash
git add -A
git commit -m "feat: header Help button opens unified Help modal, absorbing ShortcutsOverlay"
```

---

### Task 3: Documentation (README, CLAUDE.md) + final verification

**Files:**
- Modify: `README.md` (feature list, shortcuts table, architecture folder list, docs list, test counts)
- Modify: `CLAUDE.md` (keyboard-model paragraph, INV-10 test-file list, test counts)

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1-2 (entry points, tab names) and the spec at `docs/superpowers/specs/2026-08-11-help-modal-design.md`.
- Produces: docs that match the shipped app; no code.

- [ ] **Step 1: Get the real test count**

Run: `npm test 2>&1 | tail -5`
Note the reported totals (call them `<TESTS>` tests / `<FILES>` files below; expected: 345 tests / 32 files if Tasks 1-2 added exactly 11 net tests, but **use the reported numbers, not this prediction**).

- [ ] **Step 2: Update README.md**

- Line 7: `334 tests · TypeScript strict · zero backend` → `<TESTS> tests · TypeScript strict · zero backend`.
- "What it does" list: append one bullet before the `**Keyboard-first**` bullet:

```markdown
- **Built-in help** — an ⓘ button beside the theme toggle opens a guide to every feature above, plus the full shortcut list
```

- Shortcuts table, `?` row: `| `?` | Show the shortcuts overlay |` → `` | `?` | Open the help (Shortcuts tab) | ``.
- Architecture folder list line: `components/  UI, organized by feature (board, todos, notes, reminders, standup, history, commands)` → add `help` to the parenthesized list: `(board, todos, notes, reminders, standup, history, commands, help)`.
- Testing section: `334 tests across 31 files` → `<TESTS> tests across <FILES> files`.
- Docs section (`## Docs` list, the spec-amendments sentence): append `, and [`docs/superpowers/specs/2026-08-11-help-modal-design.md`](docs/superpowers/specs/2026-08-11-help-modal-design.md) (the header help button + unified Help modal)` to the list of amending specs.

- [ ] **Step 3: Update CLAUDE.md**

- Intro line: `tested (334 tests)` → `tested (<TESTS> tests)`.
- Commands table, `npm test` row: `334 tests, ~4s` → `<TESTS> tests, ~4s`.
- Keyboard-model paragraph: replace `` `?` opens the shortcuts overlay `` with `` `?` opens the Help modal on its Shortcuts tab (`src/components/help/HelpModal.tsx` — the header's `HelpButton` opens the same modal on its Guide tab) ``.
- INV-10, colocated-test-files bullet: extend the list `... `backup.test.tsx`, `pomodoro.test.tsx`` with `` `help.test.tsx` (HelpButton + HelpModal) `` before the pomodoro entry's parenthetical.

- [ ] **Step 4: Grep for stragglers**

Run: `grep -rn "ShortcutsOverlay\|shortcuts overlay\|334" README.md CLAUDE.md docs/TECH-DEBT.md src/`
Expected: no hits outside `docs/superpowers/specs/` and `docs/ARCHIVE.md` (historical docs keep their original wording; the new spec's own mention of ShortcutsOverlay is fine).

- [ ] **Step 5: Final verify and commit**

Run: `npm run verify`
Expected: green.

```bash
git add README.md CLAUDE.md
git commit -m "docs: document the help modal in README and CLAUDE.md"
```

---

## Done means

`npm run verify` green on `feat/help-modal`; the branch is **not** merged or pushed to `main` without the user's say-so (pushing deploys). Final state: ⓘ button in the header opens Help on Guide; `?` and the palette's "Keyboard shortcuts" open it on Shortcuts; `ShortcutsOverlay` no longer exists; README/CLAUDE.md updated.
