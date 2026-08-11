# Help Modal + Header Info Button — Design Spec

Amends [`2026-08-10-agile-todo-app-design.md`](2026-08-10-agile-todo-app-design.md) (which introduced the `?` shortcuts overlay this spec absorbs) and sits alongside the monthly-board and three-month-window specs, whose behavior the new guide copy describes.

## Scope

One feature: a discoverable **Help** entry point in the header — an ⓘ icon button next to the theme toggle — opening a single unified **Help modal** with two tabs:

1. **Guide** — short, scannable summaries of the app's features (monthly board, rollover, history, todos, notes, standup, pomodoro, backup/theme).
2. **Shortcuts** — the keyboard shortcut list currently rendered by `ShortcutsOverlay`, migrated as-is.

`ShortcutsOverlay` is deleted; the Help modal is its replacement, not a second door. No domain, store, or persistence changes of any kind.

## 1. Entry points

| Trigger | Opens | Initial tab |
|---|---|---|
| ⓘ `HelpButton` in the header (new, placed immediately before `ThemeToggle`) | Help modal | Guide |
| `?` keyboard shortcut (existing, rewired) | Help modal | Shortcuts |
| Command palette action `Keyboard shortcuts` (existing, rewired) | Help modal | Shortcuts |
| Command palette action `Help guide` (new) | Help modal | Guide |

The modal is informational only — it mutates no board state — so none of its entry points are gated by read-only history mode (INV-9 does not apply). It stays fully available while viewing a past month.

## 2. Components

New feature folder `src/components/help/`:

- **`HelpButton.tsx`** + `HelpButton.module.css` — a plain icon button (inline SVG, `currentColor`, same visual treatment as `ThemeToggle`), `aria-label="Help"`. Dumb component: receives `onClick` from `App.tsx`. Being a plain header button, it stays operable while a dialog is open (same rationale as `PomodoroWidget`).
- **`HelpModal.tsx`** + `HelpModal.module.css` — renders inside the shared `Modal` (which supplies `role=dialog`, Escape and backdrop close, focus handling). Accepts `initialTab: 'guide' | 'shortcuts'` and `onClose`. Tab selection is a local `useState` seeded from `initialTab`; nothing about the modal persists (not even the active tab).
- **`help.test.tsx`** — the feature's colocated test file (INV-10 grouping).

Deleted: `src/components/commands/ShortcutsOverlay.tsx` + `.module.css`; its shortcut list moves into `HelpModal.tsx` as data, and its test assertions move from `commands.test.tsx` into `help.test.tsx`. `commands.test.tsx` keeps only the palette.

### App.tsx wiring

The local `shortcutsOpen: boolean` state is replaced by `helpOpen: 'guide' | 'shortcuts' | null` — one local state value encoding both "open?" and "which tab first" (same local-`useState` pattern as `standupOpen`/`pomodoroOpen`; the store is not involved). `useShortcuts`'s `onOpenShortcutsOverlay` callback is renamed `onOpenHelp` and sets `helpOpen` to `'shortcuts'`; the `HelpButton` sets `'guide'`.

## 3. Tabs: accessibility contract

Standard WAI-ARIA tabs pattern:

- `role="tablist"` wrapping two `role="tab"` buttons (`Guide`, `Shortcuts`), `aria-selected` on the active one, each pointing at its `role="tabpanel"` via `aria-controls`/`aria-labelledby`.
- `←`/`→` move selection between tabs while focus is inside the tablist (roving tabindex: the inactive tab is `tabIndex={-1}`). This does not conflict with the global `←`/`→` day-navigation shortcuts: the modal's `role=dialog` already suppresses all global shortcuts while open.
- No new `data-*` attributes (INV-13 vocabulary untouched). Tests query by role/name.

## 4. Guide content (final copy)

All copy in English, matching the rest of the UI (user-visible text says "month", never "fortnight"). Rendered as a definition-style list of eight entries. This is the exact shipping copy; every claim below is verifiable app behavior per the product specs:

1. **Monthly board** — "The board shows the workdays (Mon–Fri) of the current month. Move between days with ← →, or press T to jump to today."
2. **Automatic rollover** — "When a new day starts, unfinished todos move forward to today and are marked as rolled over. Completed todos stay on the day you finished them."
3. **Month history** — "When a month ends, the next one is generated automatically. Use the ‹ › stepper to revisit the two previous months — past months are read-only."
4. **Todos & priorities** — "Press N to add a todo to the selected day, with high, medium or low priority. Click the checkbox to mark it done."
5. **Notes: blockers & info** — "Press Shift+N to add a note. Unresolved blockers follow you from day to day and appear in the standup until you resolve them; info notes stay where you put them."
6. **Standup** — "Press S for a summary of yesterday, today and open blockers, ready to copy for your standup."
7. **Pomodoro** — "The header timer runs focus and break sessions; press P to configure durations. Settings are saved between visits."
8. **Backup & theme** — "Export downloads your whole board as a JSON file; Import restores it. The sun/moon button switches between light, dark and system theme."

The Shortcuts tab reuses the existing `SHORTCUTS` array verbatim, with one copy change: the `?` row's description becomes "Open this help" (it previously said "Show this overlay").

## 5. Testing

In `help.test.tsx` (seeded via `seedApp()`, role/label queries, mocked clock per INV-10):

- The header renders a button named `Help`; clicking it opens a dialog on the **Guide** tab (guide headings visible, `aria-selected` on Guide).
- `initialTab='shortcuts'` opens on the Shortcuts tab, listing the shortcut descriptions (assertions migrated from `commands.test.tsx`).
- Clicking the other tab switches panels; `←`/`→` inside the tablist moves tab selection.
- Escape closes the modal (via `Modal`).
- While viewing a past month (read-only), the Help button still opens the modal.

Adjacent updates: `useShortcuts.test.tsx` (the `?` callback rename), `commands.test.tsx` (overlay assertions removed; new `Help guide` palette action covered).

## 6. Documentation updates

- **README**: add the help icon/modal to the feature list and point the shortcuts documentation at it.
- **CLAUDE.md**: keyboard-model paragraph (`?` now opens the Help modal on its Shortcuts tab; `ShortcutsOverlay` → `HelpModal`), and INV-10's grouped-test-file list gains `help.test.tsx`.

## 7. What didn't change

Global shortcut behavior (`?` still requires focus outside text fields and no open dialog), the shared `Modal`, the command palette mechanism, every store action and selector, `PersistedState` (no schema bump — nothing persists), the 3-package dependency set, and all `data-*` public API.
