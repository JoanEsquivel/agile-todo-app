# Backup Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header's two separate backup controls (an "Export backup" button and a visible file input) with one icon-button that opens a Backup dialog, and require an explicit confirmation before an import replaces the board.

**Architecture:** A new `BackupModal` owns a two-state local machine (`idle` → `confirm`). Picking a file only *parses* it; the store is untouched until the user clicks "Replace board". A new pure domain function counts todos/notes/months so the confirmation can show what is being traded for what. No store, schema, or persistence changes.

**Tech Stack:** React 19 + TypeScript 7 (strict), Zustand 5, Vitest 4 + React Testing Library, CSS Modules.

**Spec:** [`docs/superpowers/specs/2026-08-12-backup-modal-design.md`](../specs/2026-08-12-backup-modal-design.md) — product authority for this plan.

## Global Constraints

Read `CLAUDE.md` before touching `src/`. These apply to **every** task below:

- **Definition of done per task:** `npm run verify` (typecheck + all tests) is green before you commit. Never `npx tsc --noEmit` — it checks zero files and always exits 0.
- **No new runtime dependency.** The set is exactly `react`, `react-dom`, `zustand`.
- **No persistence change.** Do not touch `PersistedState`, `SCHEMA_VERSION`, `migrations.ts`, `partialize`, `validatePersistedState`, `serializeState`, `parseBackup`, `importState`, or `guardedStorage`. If a task seems to require one, stop and ask.
- **INV-2 (ambient time):** argument-less `new Date()` / `Date.now()` are banned outside `src/store/clock.ts` and `src/hooks/useNow.ts`. Get today's date from `todayLocal()`.
- **INV-3 (domain purity):** files in `src/domain/` import only relative siblings — no React, no zustand, no storage.
- **INV-10 (tests):** `describe`/`it`/`expect`/`vi` are **globals** — never import them from `vitest`. Mock the clock by mocking the `../../store/clock` module, never `vi.setSystemTime`. Canonical fixture date is **`2026-08-18`** (a Tuesday). Query by role/label, never by test-id.
- **INV-12 (CSS):** one `.module.css` per component, imported as `styles`. Colors, spacing, type sizes, radii and shadows come from `src/styles/tokens.css` custom properties only — no hard-coded hex/rgb. No `composes:`, no `:global`.
- **INV-13:** boolean data attributes are `cond ? '' : undefined`, never `data-x={false}`.
- **Exact copy strings matter.** Tests assert on them and the Help modal's copy must stay verifiable app behavior. Copy the strings from this plan verbatim, including the typographic ellipsis in `Choose file…` and the curly apostrophe in `haven't`.
- **Commit style:** conventional commits, one commit per task, ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer. Do **not** push — `main` deploys, and this work lives on the `feat/backup-modal` branch.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/domain/backup.ts` **(create)** | Pure counting of a persisted document → `BackupSummary` | 1 |
| `src/domain/backup.test.ts` **(create)** | Unit tests for the above | 1 |
| `src/components/common/BackupButton.tsx` **(create)** | Dumb header icon-button, `onClick` prop only | 2 |
| `src/components/common/BackupButton.module.css` **(create)** | Icon-button styling, mirrors `HelpButton.module.css` | 2 |
| `src/components/common/BackupModal.tsx` **(create)** | The dialog: export, import, confirmation state machine | 2, 3 |
| `src/components/common/BackupModal.module.css` **(create)** | Dialog section/warning/action styling | 2, 3 |
| `src/components/common/BackupControls.tsx` **(delete)** | Superseded | 2 |
| `src/components/common/BackupControls.module.css` **(delete)** | Superseded | 2 |
| `src/components/common/backup.test.tsx` **(rewrite)** | Feature tests for the whole flow | 2, 3, 4 |
| `src/App.tsx` **(modify)** | Mounts button + modal, adds the palette action, banner copy | 2, 4, 5 |
| `src/components/help/HelpModal.tsx` **(modify)** | Guide copy split | 5 |
| `src/components/help/help.test.tsx` **(modify)** | Asserts the new guide sections | 5 |
| `src/components/commands/commands.test.tsx` **(modify)** | Palette option-count assertion | 4 |
| `docs/TECH-DEBT.md` **(modify)** | Delete TD-3, TD-4; strike the banner-copy clause | 6 |
| `CLAUDE.md`, `README.md`, `enhancements.md` **(modify)** | Docs + test counts | 7 |

---

### Task 1: Domain — `summarizeBackup`

**Files:**
- Create: `src/domain/backup.ts`
- Test: `src/domain/backup.test.ts`

**Interfaces:**
- Consumes: `PersistedState` from `src/domain/types.ts` (existing).
- Produces: `export type BackupSummary = { todos: number; notes: number; months: number }` and `export function summarizeBackup(state: Pick<PersistedState, 'todos' | 'notes' | 'fortnights'>): BackupSummary`. Task 3 calls it twice — once on the live store state, once on the parsed backup.

The `Pick<…>` parameter type is load-bearing: it lets the function accept both a `PersistedState` (the parsed backup) and the store's `AppState` (a structural superset) with no cast at either call site. Do not narrow it to `PersistedState`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/backup.test.ts`:

```ts
import { summarizeBackup } from './backup';
import type { Fortnight, Note, Todo } from './types';

const todos = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { id: `t${i}` } as Todo]));
const notes = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`n${i}`, { id: `n${i}` } as Note]));
const fortnights = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}` }) as Fortnight);

describe('summarizeBackup', () => {
  it('reports zeros for an empty document', () => {
    expect(summarizeBackup({ todos: {}, notes: {}, fortnights: [] }))
      .toEqual({ todos: 0, notes: 0, months: 0 });
  });

  it('counts todos, notes and months independently', () => {
    // Deliberately three different numbers: a transposition between the
    // fields fails this, whereas equal counts would pass either way.
    expect(summarizeBackup({ todos: todos(7), notes: notes(2), fortnights: fortnights(3) }))
      .toEqual({ todos: 7, notes: 2, months: 3 });
  });

  it('counts keys, not array length, for the record-shaped fields', () => {
    expect(summarizeBackup({ todos: todos(1), notes: {}, fortnights: [] }))
      .toEqual({ todos: 1, notes: 0, months: 0 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: FAIL — `Failed to resolve import "./backup"`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/backup.ts`:

```ts
import type { PersistedState } from './types';

/** Counts shown in the import confirmation, for the current board and for
 *  the backup about to replace it. */
export type BackupSummary = { todos: number; notes: number; months: number };

/** `Pick` rather than `PersistedState` so the live store state (a structural
 *  superset) can be passed without a cast. `months` counts fortnights --
 *  the type keeps its legacy name, the user-facing word is "month". */
export function summarizeBackup(
  state: Pick<PersistedState, 'todos' | 'notes' | 'fortnights'>,
): BackupSummary {
  return {
    todos: Object.keys(state.todos).length,
    notes: Object.keys(state.notes).length,
    months: state.fortnights.length,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Full verify**

Run: `npm run verify`
Expected: typecheck clean, whole suite green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/backup.ts src/domain/backup.test.ts
git commit -m "feat(domain): summarizeBackup counts a persisted document

Pure counting helper for the import confirmation, which has to show what
the current board holds versus what the backup would replace it with.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Relocate export/import into a modal (behavior-preserving)

**Goal of this task:** the header gains a Backup icon-button that opens a dialog containing exactly today's two actions. Import still applies immediately — the confirmation arrives in Task 3. Keeping the relocation and the new behavior in separate commits is what makes each reviewable on its own.

**Files:**
- Create: `src/components/common/BackupButton.tsx`, `src/components/common/BackupButton.module.css`
- Create: `src/components/common/BackupModal.tsx`, `src/components/common/BackupModal.module.css`
- Delete: `src/components/common/BackupControls.tsx`, `src/components/common/BackupControls.module.css`
- Modify: `src/App.tsx` (lines 11 and 72, plus new modal state and render)
- Test: `src/components/common/backup.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `Modal` from `../common/Modal` (props: `title: string`, `onClose: () => void`, `children`, optional `initialFocusRef`); `appStorage.flush()` and `useAppStore` from `../../store/store`; `serializeState` / `parseBackup` from `../../store/exportImport`; `todayLocal()` from `../../store/clock`; the store's `announce(message: string)` action.
- Produces: `export function BackupButton({ onClick }: { onClick: () => void })` and `export function BackupModal({ onClose }: { onClose: () => void })`. Task 3 rewrites `BackupModal`'s internals; Task 4 reuses `setBackupOpen` from `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/components/common/backup.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';
import { serializeState } from '../../store/exportImport';
import { SCHEMA_VERSION } from '../../store/migrations';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

/** A valid backup of the seeded board with an emptied todo/note set, so an
 *  import is observable as "everything went away". */
function emptyBackupJson() {
  const s = useAppStore.getState();
  return serializeState({
    schemaVersion: SCHEMA_VERSION,
    fortnights: s.fortnights,
    activeFortnightId: s.activeFortnightId,
    todos: {},
    notes: {},
    lastRolloverDay: '2026-08-18',
    pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
  });
}

function backupFile(json: string, name = 'agile-todo-app-backup-2026-08-10.json') {
  return new File([json], name, { type: 'application/json' });
}

/** jsdom implements neither createObjectURL nor revokeObjectURL. Returns the
 *  spies plus the anchors the export path clicked (the anchor is synthetic,
 *  so patching the prototype is the only way to observe it). */
function stubDownload() {
  const createObjectURL = vi.fn(() => 'blob:mock');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  const clicked: HTMLAnchorElement[] = [];
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this); };
  return { createObjectURL, revokeObjectURL, clicked, restore: () => { HTMLAnchorElement.prototype.click = realClick; } };
}

async function openBackupDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backup' }));
  return screen.getByRole('dialog', { name: 'Backup' });
}

describe('backup modal', () => {
  beforeEach(() => seedApp());

  it('replaces the header controls with a single Backup button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Backup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export backup' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Import backup')).not.toBeInTheDocument();
  });

  it('opens a dialog holding both actions', async () => {
    const user = userEvent.setup();
    const dialog = await openBackupDialog(user);
    expect(within(dialog).getByRole('button', { name: 'Download backup' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Choose file…')).toBeInTheDocument();
  });

  it('exports a download named for today', async () => {
    const user = userEvent.setup();
    const dl = stubDownload();
    try {
      await openBackupDialog(user);
      await user.click(screen.getByRole('button', { name: 'Download backup' }));
      expect(dl.clicked).toHaveLength(1);
      expect(dl.clicked[0].download).toBe('agile-todo-app-backup-2026-08-18.json');
      expect(dl.createObjectURL).toHaveBeenCalledTimes(1);
      expect(dl.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    } finally {
      dl.restore();
    }
  });

  it('imports a valid backup file and replaces state', async () => {
    const user = userEvent.setup();
    const json = emptyBackupJson();
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });
    await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(json));
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('shows a parse error inside the dialog, not in the header', async () => {
    const user = userEvent.setup();
    const dialog = await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile('not json', 'bad.json'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/components/common/backup.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Backup"`.

- [ ] **Step 3: Create `BackupButton`**

`src/components/common/BackupButton.tsx`:

```tsx
import styles from './BackupButton.module.css';

/** Header archive button. Dumb on purpose: App owns the modal state, the
 *  same split as HelpButton and PomodoroWidget. */
export function BackupButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Backup"
      title="Backup — export or restore your board"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="1.6" y="2.2" width="12.8" height="3.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.8 5.4v7.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8V5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.4 8.4h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}
```

`src/components/common/BackupButton.module.css` (identical shape to `HelpButton.module.css` — tokens only):

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

- [ ] **Step 4: Create `BackupModal` (idle only)**

`src/components/common/BackupModal.tsx`:

```tsx
import { useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { todayLocal } from '../../store/clock';
import { Modal } from './Modal';
import styles from './BackupModal.module.css';

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const exportBackup = () => {
    const s = useAppStore.getState();
    const json = serializeState({
      schemaVersion: s.schemaVersion, fortnights: s.fortnights,
      activeFortnightId: s.activeFortnightId, todos: s.todos, notes: s.notes,
      lastRolloverDay: s.lastRolloverDay, pomodoroSettings: s.pomodoroSettings,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agile-todo-app-backup-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useAppStore.getState().announce('Backup downloaded');
  };

  const chooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared before the await so re-picking the same file re-fires `change`.
    e.target.value = '';
    if (!file) return;
    try {
      const state = parseBackup(await file.text());
      useAppStore.getState().importState(state);
      appStorage.flush();
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <Modal title="Backup" onClose={onClose}>
      <section className={styles.section}>
        <h3 className={styles.heading}>Export</h3>
        <p className={styles.body}>
          Download your whole board as a JSON file — every month, todo, note and your Pomodoro settings.
        </p>
        <div>
          <button type="button" className={styles.primary} onClick={exportBackup}>Download backup</button>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>Import</h3>
        <p className={styles.body}>Restore a backup you downloaded earlier.</p>
        <label className={styles.fileLabel}>
          Choose file…
          <input className={styles.fileInput} type="file" accept="application/json" onChange={chooseFile} />
        </label>
        <p className={styles.warning}>
          Importing <strong>replaces</strong> your current board. Export first if you haven’t.
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </Modal>
  );
}
```

`src/components/common/BackupModal.module.css`:

```css
.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.heading {
  font-size: var(--text-base);
}

.body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--line-height-normal);
}

.primary {
  background: var(--color-ink);
  border-color: var(--color-ink);
  color: var(--color-on-ink);
  font-weight: var(--font-weight-medium);
}

.primary:hover:not(:disabled) {
  background: var(--color-ink-hover);
  border-color: var(--color-ink-hover);
}

/* The input stays in the layer but visually hidden -- removing it with
   `display: none` would take its accessible name and keyboard focus with
   it. The label is the visible control, so it carries the focus ring on
   the input's behalf (INV-12: reach into the child with :has()). */
.fileLabel {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  cursor: pointer;
}

.fileLabel:hover {
  background: var(--color-surface-hover);
}

.fileLabel:has(.fileInput:focus-visible) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.fileInput {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.warning {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--line-height-normal);
}

.error {
  font-size: var(--text-sm);
  color: var(--color-attention);
}
```

- [ ] **Step 5: Wire it into `App.tsx`**

Four edits:

1. Replace the import on line 11:
```tsx
import { BackupButton } from './components/common/BackupButton';
import { BackupModal } from './components/common/BackupModal';
```
2. Add state next to the other modal flags (after `const [pomodoroOpen, …]`):
```tsx
const [backupOpen, setBackupOpen] = useState(false);
```
3. Replace `<BackupControls />` on line 72 with:
```tsx
<BackupButton onClick={() => setBackupOpen(true)} />
```
4. Add the modal render after the `pomodoroOpen` line:
```tsx
{backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
```

- [ ] **Step 6: Delete the old component**

```bash
git rm src/components/common/BackupControls.tsx src/components/common/BackupControls.module.css
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npx vitest run src/components/common/backup.test.tsx`
Expected: PASS, 5 tests.

If `Object.defineProperty(URL, 'createObjectURL', …)` throws, the property is non-configurable in this jsdom build — fall back to `vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL }))` and note it in the commit body.

- [ ] **Step 8: Full verify**

Run: `npm run verify`
Expected: green. `src/App.test.tsx` and `commands.test.tsx` must still pass — if either references the old controls, fix it here.

- [ ] **Step 9: Commit**

```bash
git add -A src/components/common src/App.tsx
git commit -m "refactor(backup): one header button opening a Backup dialog

The export button and the visible file input were the only native form
widgetry in a header made entirely of 16px icon-buttons, and they carried
Standup-sized weight for a once-a-month action. Behavior is unchanged --
the confirmation step lands next.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Confirmation step before an import replaces the board

**Files:**
- Modify: `src/components/common/BackupModal.tsx` (full rewrite of the component body)
- Modify: `src/components/common/BackupModal.module.css` (append the confirmation styles)
- Test: `src/components/common/backup.test.tsx`

**Interfaces:**
- Consumes: `summarizeBackup` / `BackupSummary` from `../../domain/backup` (Task 1); `PersistedState` from `../../domain/types`.
- Produces: no exported API change — `BackupModal({ onClose })` keeps its signature.

- [ ] **Step 1: Write the failing tests**

In `backup.test.tsx`, **replace** the `it('imports a valid backup file and replaces state', …)` test with the five below, and keep every other test as-is:

```tsx
  it('asks for confirmation and changes nothing until it is given', async () => {
    const user = userEvent.setup();
    const json = emptyBackupJson();
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });
    const dialog = await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(json));

    expect(await within(dialog).findByText('Replace your current board?')).toBeInTheDocument();
    expect(within(dialog).getByText('agile-todo-app-backup-2026-08-10.json')).toBeInTheDocument();
    // Singular/plural, and the two sides of the trade.
    expect(dialog).toHaveTextContent(/1 todo,/);
    expect(dialog).toHaveTextContent(/0 todos,/);
    // The whole point: nothing has been written yet.
    expect(Object.keys(useAppStore.getState().todos)).toHaveLength(1);
  });

  it('replaces the board once confirmed, and closes', async () => {
    const user = userEvent.setup();
    const json = emptyBackupJson();
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });
    await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(json));
    await user.click(await screen.findByRole('button', { name: 'Replace board' }));

    expect(useAppStore.getState().todos).toEqual({});
    expect(screen.queryByRole('dialog', { name: 'Backup' })).not.toBeInTheDocument();
  });

  it('leaves the board untouched when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const json = emptyBackupJson();
    useAppStore.getState().addTodo({ title: 'keep me', priority: 'low', scheduledDay: '2026-08-18' });
    const dialog = await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(json));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(Object.keys(useAppStore.getState().todos)).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Download backup' })).toBeInTheDocument();
  });

  it('focuses Cancel, not the destructive button, when the confirmation appears', async () => {
    const user = userEvent.setup();
    await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(emptyBackupJson()));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('discards a pending import when the dialog is dismissed with Escape', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'keep me', priority: 'low', scheduledDay: '2026-08-18' });
    await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(emptyBackupJson()));
    await screen.findByRole('button', { name: 'Replace board' });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Backup' })).not.toBeInTheDocument();
    expect(Object.keys(useAppStore.getState().todos)).toHaveLength(1);
  });
```

Also update the parse-error test to assert the confirmation never appears — append one line inside it:

```tsx
    expect(within(dialog).queryByRole('button', { name: 'Replace board' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/components/common/backup.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Replace your current board?` (and the old immediate-import behavior wipes the todo).

- [ ] **Step 3: Rewrite `BackupModal.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { summarizeBackup, type BackupSummary } from '../../domain/backup';
import { todayLocal } from '../../store/clock';
import type { PersistedState } from '../../domain/types';
import { Modal } from './Modal';
import styles from './BackupModal.module.css';

/** Picking a file only parses it. `confirm` holds the parsed document until
 *  the user explicitly accepts the replacement -- importState is destructive
 *  and irreversible, so nothing reaches the store before that click. Both
 *  summaries are snapshotted on entry rather than recomputed per render. */
type Step =
  | { step: 'idle'; error: string | null }
  | {
      step: 'confirm';
      pending: PersistedState;
      fileName: string;
      current: BackupSummary;
      incoming: BackupSummary;
    };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function countsLabel(s: BackupSummary): string {
  return `${plural(s.todos, 'todo')}, ${plural(s.notes, 'note')}, ${plural(s.months, 'month')}`;
}

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<Step>({ step: 'idle', error: null });
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Modal's own initialFocusRef only fires on mount, so the step change
  // needs its own move -- onto Cancel, never onto the destructive button.
  useEffect(() => {
    if (state.step === 'confirm') cancelRef.current?.focus();
  }, [state.step]);

  const exportBackup = () => {
    const s = useAppStore.getState();
    const json = serializeState({
      schemaVersion: s.schemaVersion, fortnights: s.fortnights,
      activeFortnightId: s.activeFortnightId, todos: s.todos, notes: s.notes,
      lastRolloverDay: s.lastRolloverDay, pomodoroSettings: s.pomodoroSettings,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agile-todo-app-backup-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useAppStore.getState().announce('Backup downloaded');
  };

  const chooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared before the await so re-picking the same file re-fires `change`.
    e.target.value = '';
    if (!file) return;
    try {
      const pending = parseBackup(await file.text());
      setState({
        step: 'confirm',
        pending,
        fileName: file.name,
        current: summarizeBackup(useAppStore.getState()),
        incoming: summarizeBackup(pending),
      });
    } catch (err) {
      setState({ step: 'idle', error: err instanceof Error ? err.message : 'Import failed.' });
    }
  };

  const confirmImport = () => {
    if (state.step !== 'confirm') return;
    // importState clears rehydrationError in the same set(), which re-enables
    // guardedStorage writes -- so it must precede the flush (INV-7).
    useAppStore.getState().importState(state.pending);
    appStorage.flush();
    useAppStore.getState().announce('Board replaced from backup');
    onClose();
  };

  return (
    <Modal title="Backup" onClose={onClose}>
      {state.step === 'idle' ? (
        <>
          <section className={styles.section}>
            <h3 className={styles.heading}>Export</h3>
            <p className={styles.body}>
              Download your whole board as a JSON file — every month, todo, note and your Pomodoro settings.
            </p>
            <div>
              <button type="button" className={styles.primary} onClick={exportBackup}>Download backup</button>
            </div>
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Import</h3>
            <p className={styles.body}>Restore a backup you downloaded earlier.</p>
            <label className={styles.fileLabel}>
              Choose file…
              <input className={styles.fileInput} type="file" accept="application/json" onChange={chooseFile} />
            </label>
            <p className={styles.warning}>
              Importing <strong>replaces</strong> your current board. Export first if you haven’t.
            </p>
            {state.error && <p className={styles.error} role="alert">{state.error}</p>}
          </section>
        </>
      ) : (
        <section className={styles.section}>
          <h3 className={styles.heading}>Replace your current board?</h3>
          <dl className={styles.compare}>
            <dt className={styles.compareTerm}>Now</dt>
            <dd className={styles.compareValue}>{countsLabel(state.current)}</dd>
            <dt className={styles.compareTerm}>{state.fileName}</dt>
            <dd className={styles.compareValue}>{countsLabel(state.incoming)}</dd>
          </dl>
          <p className={styles.danger}>This cannot be undone.</p>
          <div className={styles.actions}>
            <button type="button" ref={cancelRef} onClick={() => setState({ step: 'idle', error: null })}>
              Cancel
            </button>
            <button type="button" className={styles.destructive} onClick={confirmImport}>
              Replace board
            </button>
          </div>
        </section>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Append the confirmation styles**

Add to `BackupModal.module.css`:

```css
.compare {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
}

.compareTerm {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.compareValue {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.danger {
  font-size: var(--text-sm);
  color: var(--color-attention);
  font-weight: var(--font-weight-medium);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.destructive {
  background: var(--color-attention);
  border-color: var(--color-attention);
  color: var(--color-surface);
  font-weight: var(--font-weight-medium);
}

.destructive:hover:not(:disabled) {
  background: var(--color-attention);
  filter: brightness(1.08);
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/components/common/backup.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 6: Full verify**

Run: `npm run verify`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/BackupModal.tsx src/components/common/BackupModal.module.css src/components/common/backup.test.tsx
git commit -m "feat(backup): confirm before an import replaces the board

Picking a file now only parses it; the store is untouched until the user
accepts an explicit before/after comparison. Focus lands on Cancel, and
Escape discards the pending import rather than applying it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Command palette entry

**Files:**
- Modify: `src/App.tsx` (`paletteActions`)
- Test: `src/components/common/backup.test.tsx`, `src/components/commands/commands.test.tsx`

**Interfaces:**
- Consumes: `CommandAction` (`{ id: string; label: string; run: () => void }`) from `./components/commands/CommandPalette`; `setBackupOpen` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to the `describe('backup modal', …)` block in `backup.test.tsx`:

```tsx
  it('opens from the command palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'backup');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Backup' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/common/backup.test.tsx -t "command palette"`
Expected: FAIL — no dialog named "Backup" (Enter runs whatever else matched, or nothing).

- [ ] **Step 3: Add the action**

In `src/App.tsx`, insert into `paletteActions` **after** the `pomodoro` entry and **before** `help-guide`. It goes outside the `readOnly ? [] : […]` block on purpose — restoring a backup rewrites the whole document, including which month is active, so it is not a mutation scoped to the viewed month:

```tsx
    { id: 'backup', label: 'Backup & restore', run: () => setBackupOpen(true) },
```

- [ ] **Step 4: Fix the palette's option-count assertion**

`commands.test.tsx` asserts `21 + 5` baseline actions. Update that line to `21 + 6` so it keeps counting what it means to count:

```tsx
    expect(listbox.querySelectorAll('[role="option"]').length).toBeGreaterThanOrEqual(21 + 6);
```

- [ ] **Step 5: Run both suites and verify they pass**

Run: `npx vitest run src/components/common/backup.test.tsx src/components/commands/commands.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full verify**

Run: `npm run verify`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/common/backup.test.tsx src/components/commands/commands.test.tsx
git commit -m "feat(commands): Backup & restore in the command palette

Ungated like the Pomodoro action -- a restore rewrites the whole document
including the active month, so it isn't a viewed-month mutation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Copy — Help modal split and the banner fix

**Files:**
- Modify: `src/components/help/HelpModal.tsx` (`GUIDE_SECTIONS`)
- Modify: `src/App.tsx` (the `rehydrationError` banner text)
- Test: `src/components/help/help.test.tsx`

**Interfaces:** none — copy only.

- [ ] **Step 1: Write the failing test**

Add to the Guide-tab describe block in `src/components/help/help.test.tsx` (match the file's existing setup idiom for opening the modal on the Guide tab):

```tsx
  it('documents backup and theme as separate guide sections', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'Help' });

    expect(within(dialog).getByText('Backup')).toBeInTheDocument();
    expect(within(dialog).getByText('Theme')).toBeInTheDocument();
    expect(within(dialog).queryByText('Backup & theme')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(/asks you to confirm first/i);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/help/help.test.tsx -t "separate guide sections"`
Expected: FAIL — `Unable to find an element with the text: Backup`.

- [ ] **Step 3: Split the guide section**

In `HelpModal.tsx`, replace the single `'Backup & theme'` entry in `GUIDE_SECTIONS` with these two, at the same position:

```tsx
  {
    title: 'Backup',
    body: 'The archive button in the header exports your whole board as a JSON file and restores one. Importing replaces everything you have now, so it asks you to confirm first. Clearing your browser\'s site data erases the board — export a backup if you want to keep it.',
  },
  {
    title: 'Theme',
    body: 'The sun/moon button switches between light, dark and system theme.',
  },
```

Every clause must stay verifiable app behavior, per the file's own header comment — these are.

- [ ] **Step 4: Fix the banner copy**

In `src/App.tsx`, the `rehydrationError` banner currently ends `…and has not been modified. Try reloading, or import a backup below.` — the controls have never been *below* it. Replace that final sentence with:

```
Try reloading, or use the Backup button in the header to import a backup.
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: PASS. If an existing test asserts the old `'Backup & theme'` string or the old banner sentence, update it here.

- [ ] **Step 6: Full verify**

Run: `npm run verify`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/components/help/HelpModal.tsx src/components/help/help.test.tsx src/App.tsx
git commit -m "docs(help): split the backup and theme guide sections

Backup now has enough behavior to describe -- one button, and an import
that confirms first -- to stop sharing a section with the theme toggle.
Also fixes the rehydration banner pointing 'below' at header controls.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Settle the tech debt this feature touched

`CLAUDE.md` requires debt fixes to land as their own commit with their own test, deleting the row. Three rows are settled here.

**Files:**
- Modify: `src/components/common/BackupModal.tsx` (`exportBackup`)
- Modify: `docs/TECH-DEBT.md`
- Test: `src/components/common/backup.test.tsx`

**Interfaces:** none — internal fix.

- [ ] **Step 1: Write the failing test**

Extend the existing export test in `backup.test.tsx` — inside `stubDownload`'s patched `click`, the anchor must already be in the document:

```tsx
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicked.push(this);
    attachedAtClick.push(this.isConnected);
  };
```

Declare `const attachedAtClick: boolean[] = [];` alongside `clicked`, return it from `stubDownload`, and add to the export test:

```tsx
      // TD-3: WebKit historically ignores .click() on a detached anchor.
      expect(dl.attachedAtClick).toEqual([true]);
      expect(document.querySelectorAll('a[download]')).toHaveLength(0); // cleaned up after
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/common/backup.test.tsx -t "exports a download"`
Expected: FAIL — `expected [ false ] to deeply equal [ true ]`.

- [ ] **Step 3: Attach the anchor before clicking**

In `BackupModal.tsx`'s `exportBackup`, replace:

```tsx
    a.click();
    URL.revokeObjectURL(url);
```

with:

```tsx
    // Attached before the click: WebKit ignores .click() on a detached
    // anchor, so a detached one silently downloads nothing (TD-3).
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/components/common/backup.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Delete the settled debt rows**

In `docs/TECH-DEBT.md`:
- Delete the **TD-3** row (the detached-anchor row).
- Delete the **TD-4** row (export has no automated test) — the export test added in Task 2 and extended here settles it.
- In the "Final-review Minor findings" paragraph, strike only the third clause: *"one banner copy line says 'import a backup below' when `BackupControls` actually renders above it in the header."* The other two findings in that paragraph are untouched and must remain.

Do not renumber the surviving rows — the IDs are cited elsewhere.

- [ ] **Step 6: Full verify**

Run: `npm run verify`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/BackupModal.tsx src/components/common/backup.test.tsx docs/TECH-DEBT.md
git commit -m "fix(backup): attach the export anchor before clicking it (TD-3)

WebKit ignores .click() on a detached anchor, so Safari users may have
been getting no file at all. Also retires TD-4 and the banner-copy
finding, both settled by this feature's tests and copy fix.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Documentation and counts

**Files:**
- Modify: `CLAUDE.md` (INV-8, test count in the header line and the commands table)
- Modify: `README.md` (storage paragraph ~line 105, test counts at lines 7 and 96)
- Modify: `enhancements.md`

**Interfaces:** none.

- [ ] **Step 1: Get the real test count**

Run: `npm test`
Record the exact `Tests  N passed (N)` figure and the file count from the same summary line. Use those numbers below — do not guess.

- [ ] **Step 2: Amend INV-8 in `CLAUDE.md`**

Append to the INV-8 **Why** paragraph:

```
The "replace your board?" confirmation lives in `BackupModal`, not in this action: `importState` is unconditionally destructive on its own, so any future caller has to supply its own confirmation rather than assuming one already happened.
```

- [ ] **Step 3: Update the test counts**

- `CLAUDE.md` line 3: `tested (433 tests)` → the recorded count.
- `CLAUDE.md` commands table: `vitest run` — `433 tests, ~4s` → the recorded count.
- `README.md` line 7: `433 tests · TypeScript strict · zero backend` → the recorded count.
- `README.md` line 96: `433 tests across 34 files` → the recorded counts (the file count rises by one — `src/domain/backup.test.ts`).

- [ ] **Step 4: Update the README storage paragraph**

In the paragraph at ~line 105, after *"export a JSON backup first if you want to keep it"*, add:

```
Importing a backup replaces everything currently on the board, so the app shows you what you have versus what the file holds and asks you to confirm before it writes anything.
```

- [ ] **Step 5: Retire the enhancement item**

In `enhancements.md`, comment out the backup bullet the way shipped items are recorded there:

```
<!-- - ~~Es buena idea juntar el boton de export backup y import en uno solo…~~ Shipped: one header Backup button opening a dialog, with a confirmation step before an import replaces the board (see `docs/superpowers/specs/2026-08-12-backup-modal-design.md`). -->
```

- [ ] **Step 6: Full verify**

Run: `npm run verify`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md enhancements.md
git commit -m "docs: record the backup modal in the project docs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final check

- [ ] `npm run verify` green.
- [ ] `grep -rn "BackupControls" src/` returns nothing.
- [ ] `grep -rn "import a backup below" src/ docs/` returns nothing.
- [ ] Manual smoke (`npm run dev`): the header shows one archive button; the dialog exports a file; importing a valid backup shows the comparison and only applies on "Replace board"; importing a junk file shows the error inside the dialog and never reaches the comparison; Escape from the comparison leaves the board intact.
- [ ] Branch `feat/backup-modal` is **not** pushed — `main` deploys.
