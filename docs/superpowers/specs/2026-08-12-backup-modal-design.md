# Backup Modal (unified export/import + import confirmation) — Design

**Date:** 2026-08-12
**Status:** Approved
**Author decisions:** header icon-button (not a text button, not buried in Help); confirmation *in scope* rather than a pure relocation; single-modal step change (mockup option A) over a nested dialog or an inline expansion, validated via the brainstorming visual companion; command palette as the only extra entry point (no keyboard shortcut, no button in the rehydration-error banner).

## Purpose

Today the header carries two separate backup controls: an `Export backup` button and an `Import backup` `<label>` wrapping a **visible** `<input type="file">`. Three problems:

1. **Visual incoherence.** Every other header control is a 16px icon-button. The file input is the only element in the app chrome that renders native form widgetry ("No file selected", `max-width: 9rem`).
2. **Disproportionate weight.** Backup is a once-a-month maintenance action occupying the same header real estate as Standup, a daily one.
3. **Import destroys the board with no warning.** `importState` replaces the entire persisted document. Today a mis-clicked file in the picker wipes everything, silently and irreversibly.

There is also an existing copy bug this fixes at the root: the rehydration-error banner (`App.tsx`) says *"import a backup below"* while the controls live **above** it, in the header.

## Scope

- Two new components, one deleted; one new pure domain module; one new command-palette action; copy changes in `App.tsx`, `HelpModal.tsx`, `README.md`.
- **No persistence changes.** `PersistedState` keeps its 7 fields, `SCHEMA_VERSION` is not bumped, `partialize` is untouched, `validatePersistedState` is untouched. INV-6's ritual does not apply.
- **No store changes.** `importState` keeps its exact current semantics and its INV-8 field enumeration. The confirmation is a UI affordance layered on top of it, not a reducer guard.
- Not gated by read-only history mode (INV-9 does not apply — import is a global document restore, not a mutation scoped to the viewed month; it rewrites `activeFortnightId` along with everything else).
- No new runtime dependency.

## 1. Components

### `BackupButton` — `src/components/common/BackupButton.tsx` + `.module.css`

Dumb header trigger, structurally identical to `HelpButton` (App owns the modal state):

- `<button type="button" aria-label="Backup" title="Backup — export or restore your board" onClick={onClick}>`
- Inline 16×16 SVG (`viewBox="0 0 16 16"`, `stroke`/`fill: currentColor`, `aria-hidden="true"`, `focusable="false"`) — an archive/box glyph. Same icon idiom as `HelpButton`, `ThemeToggle` and the todo drag handle.
- Its `.module.css` mirrors `HelpButton.module.css`: tokens only, no hard-coded colors (INV-12).

### `BackupModal` — `src/components/common/BackupModal.tsx` + `.module.css`

Owns the whole flow. Renders inside the shared `Modal` with `title="Backup"`.

### Deleted

`src/components/common/BackupControls.tsx` and `BackupControls.module.css`. Its export and import logic moves into `BackupModal` unchanged in substance (the `Blob` → object-URL → synthetic `<a>` download, the `parseBackup` → `importState` → `appStorage.flush()` sequence).

### Why `common/` and not a new `src/components/backup/` folder

Backup is app chrome, alongside `ThemeToggle`, `AuthorLinks`, `DonateButton` and `Modal` itself — not a board feature area like `todos/` or `notes/`. `backup.test.tsx` already lives in `common/`, so the per-feature test grouping of INV-10 is preserved with zero file moves.

## 2. Wiring in `App.tsx`

- `const [backupOpen, setBackupOpen] = useState(false);` alongside the existing four modal flags.
- `<BackupButton onClick={() => setBackupOpen(true)} />` replaces `<BackupControls />` in `headerActions`, in the same position (between `FortnightNav` and `PomodoroWidget`).
- `{backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}` joins the other modals at the bottom.
- `paletteActions` gains `{ id: 'backup', label: 'Backup & restore', run: () => setBackupOpen(true) }`, placed after `pomodoro` and before the two help entries. **Not** inside the `readOnly ? [] : [...]` block — same reasoning as `pomodoro`, which is also unconditional.

No new keyboard shortcut: `useShortcuts` and the Help modal's `SHORTCUTS` list are untouched.

## 3. Domain: `src/domain/backup.ts`

New pure module (INV-3: imports only `./types`).

```ts
export type BackupSummary = { todos: number; notes: number; months: number };

export function summarizeBackup(
  state: Pick<PersistedState, 'todos' | 'notes' | 'fortnights'>,
): BackupSummary;
```

Returns `Object.keys(state.todos).length`, `Object.keys(state.notes).length`, `state.fortnights.length`.

The `Pick<…>` parameter type is deliberate: it lets the same function be called on the **parsed backup** (a `PersistedState`) and on the **live store state** (an `AppState`, a structural superset) without a cast at either call site.

### Why no export timestamp

The confirmation would ideally say *"exported on 10 Aug 2026"*, but `PersistedState` has no timestamp field, and adding one would trigger INV-6's full 6-step ritual (schema bump + migration step + `partialize` + `validatePersistedState` + migration and round-trip tests) to serve one line of text. Instead the confirmation shows the **file name**, which already carries the date by construction — `exportBackup` names downloads `agile-todo-app-backup-${todayLocal()}.json`. No schema change, and the information is honest: it is the file the user picked, not a claim about when the data was captured.

## 4. Modal states and flow

```ts
type Step =
  | { step: 'idle'; error: string | null }
  | { step: 'confirm'; pending: PersistedState; fileName: string };
```

Held in a single `useState<Step>({ step: 'idle', error: null })`. Nothing goes in the store — the flow is entirely local to the modal's lifetime, and per INV-6 an ephemeral concern belongs on neither `PersistedState` nor `AppState` unless something outside the component needs it. Nothing does.

### `idle`

Two sections inside the modal body:

**Export.** Copy: *"Download your whole board as a JSON file — every month, todo, note and your Pomodoro settings."* Primary button **"Download backup"**. On click: the current `exportBackup` implementation verbatim (`serializeState` over the 7 `PersistedState` fields read from `useAppStore.getState()`, `Blob` → `URL.createObjectURL` → synthetic `<a download>` → `URL.revokeObjectURL`), then `useAppStore.getState().announce('Backup downloaded')`.

**Import.** Copy: *"Restore a backup you downloaded earlier."* A **"Choose file…"** button — a `<label>` wrapping a **visually hidden** `<input type="file" accept="application/json">` (the label's text is the accessible name, so `getByLabelText` still works and the native widget no longer leaks into the layout). Below it, a warning block: *"Importing **replaces** your current board. Export first if you haven't."*

On change: read the file, `parseBackup(text)`.
- **Throws** → stay in `idle` with `error` set to the thrown message. Rendered as `<p role="alert">` **inside the modal**, not in the header. The input's `value` is cleared first (as today) so re-picking the same file re-fires `change`.
- **Succeeds** → `{ step: 'confirm', pending, fileName: file.name }`. **The store has not been touched.**

If `error` is set, picking a new file clears it.

### `confirm`

The modal body is **replaced** (Export and Import sections unmount) by:

- Heading: *"Replace your current board?"*
- The file name.
- A two-line comparison built from `summarizeBackup`: current → *"Now: 23 todos, 4 notes, 3 months"*; incoming → *"`agile-todo-app-backup-2026-08-10.json`: 18 todos, 2 notes, 3 months"*. Singular/plural handled (`1 todo`, not `1 todos`).
- Warning: *"This cannot be undone."*
- **"Replace board"** (destructive styling — `--color-attention`, the token the existing error copy already uses) and **"Cancel"**.

**Replace board** → `importState(pending)` → `appStorage.flush()` → `announce('Board replaced from backup')` → `onClose()`. `importState` already clears `rehydrationError` in the same `set()`, which re-enables `guardedStorage` writes before the `flush()` (INV-7) — this ordering is inherited from the current `BackupControls` and must not be reordered.

**Cancel** → back to `{ step: 'idle', error: null }`, `pending` dropped.

**Escape** closes the entire modal and discards the pending import. This is inherited from `Modal`'s own key handler with no extra code: the non-destructive outcome is the correct default for an unhandled dismissal, so there is deliberately no "Escape goes back a step" behavior. Same for the `×` button and the scrim click.

### Focus

Entering `confirm` moves focus to **Cancel**, not to the destructive button — a `useEffect` keyed on `step` calling `.focus()` on a ref. `Modal`'s own `initialFocusRef` only applies on mount, so it cannot serve this; the modal opens with focus on the dialog container as today.

## 5. Copy changes outside the modal

### `HelpModal.tsx`

The single `'Backup & theme'` guide section splits into two, keeping the same position in `GUIDE_SECTIONS`:

- **`Backup`** — *"The archive button in the header exports your whole board as a JSON file and restores one. Importing replaces everything you have now, so it asks you to confirm first. Clearing your browser's site data erases the board — export a backup if you want to keep it."*
- **`Theme`** — *"The sun/moon button switches between light, dark and system theme."*

Per the file's own header comment, guide copy must stay verifiable app behavior; every clause above is.

### `App.tsx` rehydration-error banner

*"Try reloading, or import a backup below."* → *"Try reloading, or use the Backup button in the header to import a backup."* The banner stays plain text — no button, per the entry-point decision.

### `README.md`

Line ~105 (storage/privacy paragraph) gains a clause noting that importing a backup replaces the current board and asks for confirmation first.

## 6. Testing (INV-10)

### `src/domain/backup.test.ts` (new)

Empty state → zeros. Populated state → correct counts for todos, notes and fortnights independently (so a copy-paste transposition between the three fails).

### `src/components/common/backup.test.tsx` (rewritten)

Keeps the existing `vi.mock('../../store/clock', …)` at `2026-08-18` and `seedApp()` in `beforeEach`.

- The header renders a `Backup` button and **no longer** exposes `Export backup` / `Import backup` controls directly.
- Clicking it opens the dialog with both sections.
- **Export**: clicking `Download backup` produces a download named `agile-todo-app-backup-2026-08-18.json`. Requires stubbing `URL.createObjectURL` / `URL.revokeObjectURL` (absent in jsdom) via `vi.stubGlobal`, and spying on the synthetic anchor's `click`.
- **Valid file → confirmation**: the confirmation text shows both counts, **and `useAppStore.getState().todos` is unchanged at this point.** This is the assertion that actually proves the feature.
- **Confirm** → state replaced (the current "imports a valid backup file and replaces state" assertion, now behind the extra click).
- **Cancel** → state unchanged, back to the Export/Import view.
- **Invalid file** → `role="alert"` inside the dialog with the `not valid JSON` message, and no confirmation UI. (Adapted from the existing invalid-file test.)
- **Command palette** → `⌘K` → `Backup & restore` opens the same dialog.

### `src/components/help/help.test.tsx`

Assert the Guide tab renders a `Backup` section mentioning the confirmation, and a separate `Theme` section.

### Unchanged

`src/store/exportImport.test.ts` and `src/store/storePersistence.test.ts` — no store or schema behavior changes. Test count in `CLAUDE.md`/`README.md` gets bumped to whatever the suite reports afterwards.

## 7. Documentation updates

- `CLAUDE.md` — INV-8 gains one sentence: the "replace your board?" confirmation lives in `BackupModal`, **not** in `importState`; the action itself is unconditionally destructive and any future caller must supply its own confirmation. No new invariant, no renames (`backup.test.tsx` keeps its name and location, so INV-10's test list is still accurate).
- `README.md` — the storage/privacy clause above, plus the test count.
- `enhancements.md` — the backup item gets commented out with a pointer to this spec, matching how shipped items are recorded there.
- `docs/TECH-DEBT.md` — three rows are settled by this work, and per `CLAUDE.md` the debt fixes land as their **own commit**, not folded into a feature commit:
  - **TD-3** (the export anchor is never attached to the DOM before `.click()`, which historically fails in WebKit) is fixed in the relocated export code: `document.body.appendChild(a)` before the click, `a.remove()` after. Row deleted.
  - **TD-4** (the export path has no automated test) is settled by the new export test in §6. Row deleted.
  - The third bullet of the "Final-review Minor findings" paragraph — *"one banner copy line says 'import a backup below' when `BackupControls` actually renders above it in the header"* — is fixed by §5. That clause is struck from the paragraph.

## 8. What didn't change

`PersistedState`, `SCHEMA_VERSION`, `migrations.ts`, `partialize`, `guardedStorage`, `validatePersistedState`, `serializeState`, `parseBackup`, `importState`, `useShortcuts`, the `SHORTCUTS` list, `Modal.tsx`, and every domain module other than the new `backup.ts`.
