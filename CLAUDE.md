# CLAUDE.md — Agile Todo App

> This app is **finished, tested (383 tests), and deployed**. It is not a scaffold to build out — it's a working product. Changes here should be surgical, not exploratory. Every change ships with tests. Read the invariants below before editing anything under `src/`.

## Orientation

Browser-only monthly (calendar-month, workdays-only) todo board, plus a header Pomodoro timer and a manual light/dark/system theme toggle. No backend, no network calls, no accounts — everything lives in one versioned JSON document in `localStorage` (plus one tiny separate key for the theme preference — see INV-12).

**Stack:** React 19 + TypeScript 7 (strict) + Vite 8 + Zustand 5 (`persist` middleware) + Vitest 4 + React Testing Library + CSS Modules. **No ESLint, no Prettier** — `tsc` with `strict` + `noUnusedLocals` + `noUnusedParameters` is the linter.

**Keyboard model.** `src/hooks/useShortcuts.ts` is a global `keydown` listener mounted once in `App.tsx`: `⌘K`/`Ctrl+K` opens the command palette (`src/components/commands/CommandPalette.tsx`), `?` opens the Help modal on its Shortcuts tab (`src/components/help/HelpModal.tsx` — the header's `HelpButton` opens the same modal on its Guide tab), `←`/`→`/`Home`/`End` move the selected day (the fortnight tape, `src/components/board/FortnightTape.tsx`, has its own roving-tabindex handler for when focus is already on a day button — the two compose via `e.preventDefault()`/`e.defaultPrevented`, not by one knowing about the other), `T` jumps to today, `N`/`Shift+N` open the todo/note compose form, `S` opens Standup, `P` opens the Pomodoro modal (`src/components/pomodoro/`). Every shortcut but `⌘K` bails while focus is in a text-entry control or a `[role=dialog]` is mounted — which is why the always-mounted `PomodoroWidget` in the header uses plain buttons: they stay operable while a dialog has the shortcuts dead. Escape is deliberately *not* handled there — `Modal.tsx` and `TodoForm`/`NoteForm` each own their own, which is what lets Escape work from inside a text field.

**Where to look for what:**
- Product behavior, edge cases, the "why" behind a rule → [`docs/superpowers/specs/2026-08-10-agile-todo-app-design.md`](docs/superpowers/specs/2026-08-10-agile-todo-app-design.md) (the original approved design spec — product authority), amended by [`docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md`](docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md) (the monthly-board redesign — also product authority, for the board grid, scheduling horizon, and navigation UI it amends) and by [`docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md`](docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md) (also product authority, for the fixed 3-month retention window, automatic month generation, and the `FortnightNav` stepper it amends)
- Known gaps and parked issues → [`docs/TECH-DEBT.md`](docs/TECH-DEBT.md)
- How it was originally built → [`docs/ARCHIVE.md`](docs/ARCHIVE.md) (historical only)

> ⚠️ **Do not read `docs/superpowers/plans/2026-08-10-agile-todo-app-implementation.md`.** It's a ~3200-line historical TDD execution script, superseded by the actual code. Reading it in full burns ~40k tokens of context for near-zero value. If you need one specific historical decision from it, `grep` for it — don't read it end to end.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at `http://localhost:5173` |
| `npm test` | `vitest run` — 383 tests, ~4s |
| `npm run typecheck` | `tsc -b --noEmit` — the real typecheck, ~0.3s |
| `npm run verify` | typecheck + test — **this is the definition of done** |
| `npm run build` | `tsc -b && vite build` — production build |

> ⚠️ **`npx tsc --noEmit` at the repo root checks ZERO files and always exits 0.** `tsconfig.json` is a solution-style file (`"files": []`, references-only) — running the bare command against it type-checks nothing, silently. This was a real bug in this repo's CI until it was fixed. **Never use `npx tsc --noEmit` to verify anything.** Always use `npm run typecheck` (which correctly invokes `tsc -b --noEmit`, the *build*-mode form that follows project references into `tsconfig.app.json`).

## Definition of done

`npm run verify` is green, the change has new or updated tests that would fail without it, and you haven't silently added an entry to `docs/TECH-DEBT.md`'s territory without writing it down. CI (`.github/workflows/deploy.yml`) runs the same gate before every deploy to GitHub Pages.

## Architecture: dependencies point one way

```
src/domain/  →  (nothing — pure)
src/store/   →  domain
src/hooks/   →  store, react
src/components/  →  store, domain, hooks, react
```

Arrows never reverse. An import from `../store` inside `src/domain/`, or from `../components` inside `src/store/`, is a bug — not a shortcut, not an exception. `src/domain/` in particular is pure: it imports only its own siblings (`./types`, `./dates`, `./fortnight`), never React, never `zustand`, never `localStorage`. Domain functions take `today`/`now` as explicit parameters instead of reading ambient time — that's what makes them trivially unit-testable.

## Invariants

Numbered so they can be cited precisely (a hook message might say "violates INV-5"). Ordered roughly by blast radius — the ones at the top break the most things if violated.

### INV-1. Never derive a scheduling date from a UTC string
**Rule.** Scheduling dates (`ISODate = "YYYY-MM-DD"`) are always built from *local* `Date` fields via `toISODate()` in `src/domain/dates.ts`. Never `toISOString().slice(0, 10)` or any UTC-string-slicing to get a calendar date.
**Why.** `toISOString()` is UTC. Slicing it shifts the date by a day for any user east or west of UTC at certain times of day — a silent, timezone-dependent bug.
**Check.** `grep -rn "toISOString()\s*\.\s*\(slice\|substring\|substr\|split\)" src/` must return nothing.

### INV-2. Ambient time lives in exactly two files
**Rule.** Argument-less `new Date()` and `Date.now()` may appear only in `src/store/clock.ts` (`todayLocal()`, `nowIso()` — for state mutations) and `src/hooks/useNow.ts` (a ticking render clock, 30s default interval — for UI that needs to visually update, like overdue badges). Everywhere else, take time as a parameter or read it via `clock.ts`.
**Why.** This is what makes every domain function and every store action deterministically testable — tests inject a fixed `today`/`now` instead of racing the real clock.
**Check.** `new Date()` (no args) or `Date.now()` outside those two files. `new Date(withArguments)` is fine anywhere (it's not reading ambient state).

### INV-3. `src/domain/` is pure
**Rule.** Files in `src/domain/` import only their own siblings — currently `./types`, `./dates`, `./fortnight`. No React, no `zustand`, no storage, no ambient time, no `require()`.
**Why.** The domain layer is the one place all the fortnight/rollover/standup/reminder logic lives, and it stays unit-testable with zero DOM/mocking overhead specifically because it has zero dependencies on anything stateful.
**Check.** Any import in `src/domain/*.ts` that isn't a relative sibling path.

### INV-4. Calendar rules
**Rule.** Weeks start Monday. **Sunday belongs to the *preceding* Monday**, not the upcoming one (`mondayOfWeek` maps day-of-week 0 to `-6`, not `+1`). Workdays are Mon–Fri only. The active period (still typed and named `Fortnight`, see the naming note below) is the **workdays of the calendar month containing the anchor date** — 20–23 days, with the first and/or last week possibly partial (not necessarily starting Monday or ending Friday); an anchor that falls after the month's last workday rolls forward to the next month. **No consumer of `Fortnight.days` may assume a fixed length** — never `days[9]`, never `length === 10` — because historical 10-workday fortnights (pre-redesign, two Mon–Fri weeks) persist unmigrated in storage and stay navigable in read-only history (see INV-6's schema v3 note).
**Why.** Gets this wrong once and every period-boundary, rollover, and standup "yesterday" calculation is off by a week for weekend users. The length-agnostic requirement is what lets old 10-day history and new ~21-day months coexist without a data migration touching every stored period.
**Check.** `src/domain/dates.test.ts` and `src/domain/fortnight.test.ts` — the weekend-anchor and month-generation cases are the ones that catch this.

### Naming note: `Fortnight*` is legacy naming, deliberately kept
The board's scheduling horizon changed from a 10-workday fortnight to a calendar month, but the internal naming didn't follow: `Fortnight` (the type), `fortnightId`, `FortnightTape`/`FortnightBoard`/`FortnightNav`, `fortnight.ts`, `activeFortnightId`/`viewedFortnightId`, etc. all keep their original names. This is deliberate — renaming would touch the persisted `fortnightId` field and ~40 files for zero user-facing value. All user-visible text (UI copy, docs prose) says "month"; all code identifiers say "fortnight". Don't "fix" this inconsistency piecemeal.

### INV-5. `fortnightId` is the migration cursor — the anti-double-migration rule
**Rule.** Two functions move todos between days/fortnights, and they're kept disjoint by which field they key on and which field they write:
- `applyRollover` (`src/domain/rollover.ts`) keys on `todo.fortnightId === activeFortnight.id`, writes `scheduledDay` + `rolledOver`, and **never writes `fortnightId`**. It no-ops entirely once the fortnight is expired.
- `carryOverTodos` (`src/domain/fortnight.ts`) keys on `todo.fortnightId === oldFortnightId`, and **always** writes `fortnightId = newFortnight.id`.
- `done` todos are excluded from both — completed todos stay pinned to the fortnight they were finished in, which is what makes history immutable.
- `lastRolloverDay` is a once-per-local-day latch (`checkDayTick` early-returns if it already equals today), which is what makes it safe to call from `initApp`, a 60s interval, `visibilitychange`, `focus`, and `importState`.
- **`regenerateFortnight` must also stamp `lastRolloverDay`.** Without it, a same-day tick after regeneration would run `applyRollover` over todos `carryOverTodos` just placed on future overlap days and yank them back to today — destroying the "future plans aren't touched" rule. `regenerateFortnight` is now internal-only (no UI door since the three-month-window redesign — it survives as a safety valve and shared test fixture); `checkDayTick`'s own generation branch, the one that actually fires when the active month has ended, goes through the same shared `buildGeneration` helper in `src/store/store.ts` and so carries the identical stamp-`lastRolloverDay`-in-the-same-`set()` obligation.
- Blocker notes follow the identical discipline via sibling functions — `applyNoteRollover`/`carryOverNotes` (also in `rollover.ts`/`fortnight.ts`), keyed and called from the same two actions, same never-writes-`fortnightId`-on-rollover / always-writes-it-on-carry-over split. Only unresolved blockers move; resolved blockers and `info` notes are excluded from both, same as `done` todos.

**Why.** Because `fortnightId` only ever advances forward (old → new) and is the sole key both functions check, the same todo (or note) can never be migrated twice, and rollover can never make a todo eligible for a carry-over it wasn't already eligible for.
**Check.** `src/domain/rollover.test.ts`, `src/domain/carryOver.test.ts`, `src/store/dayTick.test.ts`.

### INV-6. `partialize` is an allowlist — schema changes need a ritual
**Rule.** `PersistedState` (`src/domain/types.ts`) has 7 fields (schema v2 added `pomodoroSettings`; v3 reshaped the active fortnight into a calendar month in place — no field changes); `partialize` in `src/store/store.ts` explicitly lists all 7. **Adding a field to `PersistedState` and forgetting to add it to `partialize` means it silently never persists** — no error, no warning, just data loss on reload.
**Why.** An allowlist (vs. "persist everything except UI state") is the safer default for a store that also holds ephemeral fields (`viewedFortnightId`, `selectedDay`, `rehydrationError`, `announcement`, `composeIntent`, `theme`, `pomodoro`) — an accidental leak the other direction would be much harder to notice. When adding a new ephemeral field, the correct amount of ritual is *none*: put it on `AppState` only, never `PersistedState`, and don't bump `SCHEMA_VERSION`. Add one assertion to `storePersistence.test.ts` confirming it's absent from the persisted blob — that's the whole checklist, and it's the opposite of the 6-step recipe below.
**Check.** `src/store/storePersistence.test.ts` asserts the ephemeral fields are absent from the persisted blob.
→ See the schema-change recipe below for the full 6-step ritual.

### INV-7. `guardedStorage` drops writes while a rehydration error is active
**Rule.** `src/store/store.ts`'s `guardedStorage` wraps the debounced localStorage adapter and drops **all** writes while `rehydrationError` is set. Two things depend on this: `initApp` early-returns (no auto-creating a fresh fortnight) when `rehydrationError` is set, and `importState` clears `rehydrationError` in the *same* `set()` call that loads new data (which re-enables writes).
**Why.** Zustand's `persist` middleware calls `storage.setItem` after every `set()` — including the one that merely *records* a rehydration failure. Without the guard, recording "rehydration failed" would itself schedule a debounced write of the current (empty, never-loaded) in-memory state, clobbering the user's original — possibly still-recoverable — stored bytes.
**Check.** `src/store/storePersistence.test.ts` (the rehydration-error tests).

### INV-8. `importState` enumerates fields, never spreads
**Rule.** `importState` in `src/store/store.ts` builds the new state object by explicitly listing the known `PersistedState` fields — it never does `set({ ...backupObject, ... })`.
**Why.** A backup JSON file is untrusted input. `validatePersistedState` only requires the 6 known fields to be present; it doesn't forbid extras. A spread would let a backup file containing e.g. `"toggleDone": null` clobber a store action function.
**Check.** `src/store/storePersistence.test.ts` — the test that imports a backup with an extra key matching an action name and asserts the action still works.

### INV-9. Read-only history mode is derived, passed down, and must gate the *form*
**Rule.** There is no `readOnly` field in state. It's computed once via `selectIsReadOnly(s) = s.viewedFortnightId !== s.activeFortnightId` (in `src/store/selectors.ts`), computed once in `DayColumn`, and passed **down as a prop** to leaf components (`TodoItem`, `NoteCard`). Whether a compose form is open lives in the store as `composeIntent: 'todo' | 'note' | null` (`src/store/store.ts`), not local `useState` — the command palette and the keyboard shortcuts (`N`/`Shift+N`) need to open it from outside `DayColumn`. When adding any mutating UI:
1. Gate the render of the mutating element itself on `!readOnly` — not just its trigger button. (An "Add" button hidden while the form it opens keeps rendering is a real, previously-shipped bug.)
2. `setComposeIntent` itself refuses in the reducer when `viewedFortnightId !== activeFortnightId` and the caller is trying to *open* (closing, `null`, is always allowed) — this is the one that matters most, since it's the only guard a keyboard shortcut or palette action can't route around. Don't add a second way to set `composeIntent` that bypasses this action.
3. Reset any open-form state when the viewed fortnight changes (`DayColumn`'s `useEffect` keyed on `fn?.id`) — the fortnight switcher is always enabled, and an automatic fortnight switch (rollover, regenerate) changes `fn?.id` without going through `viewFortnight`'s own explicit clear, so this is a second, independent guard, not a duplicate of it.

**Why.** A todo/note created while viewing a read-only fortnight gets `fortnightId` from the *active* fortnight (via the store action) but `day`/context from the *viewed* (read-only, different) fortnight — producing an orphan that's permanently invisible on every board, and if it's a blocker note, one that shows up forever in the standup with no way to resolve or delete it. This exact bug was a Critical finding in the final review, and the keyboard/palette layer added later is exactly the kind of new door it could have reopened through if `setComposeIntent`'s own refusal weren't the thing actually stopping it. See `src/components/board/DayColumn.tsx` and `src/store/store.ts`'s `setComposeIntent`.
**Check.** `src/components/notes/notes.test.tsx` and `src/components/todos/todos.test.tsx` — the read-only-mode regression tests — plus `src/store/store.test.ts`'s `setComposeIntent` describe block and `src/hooks/useShortcuts.test.tsx`.

### INV-10. Test conventions
**Rule.**
- `globals: true` in Vitest config — never `import { describe, it, expect, vi } from 'vitest'`.
- Tests are colocated. Component tests are grouped **per feature folder**, not per component — one `todos.test.tsx` covers `TodoItem` + `TodoForm` together, similarly `notes.test.tsx`, `history.test.tsx`, `reminders.test.tsx`, `standup.test.tsx`, `backup.test.tsx`, `help.test.tsx` (HelpButton + HelpModal), `pomodoro.test.tsx` (+ its sibling `notify.test.ts` for the feature-detected platform shims).
- The clock is mocked by **mocking the module**, never `vi.setSystemTime`:
  ```ts
  vi.mock('../../store/clock', () => ({
    todayLocal: () => '2026-08-18',
    nowIso: () => '2026-08-18T12:00:00.000Z',
  }));
  ```
  (Path is relative to the test file — `./clock` in a `src/store/*.test.ts`, `../../store/clock` in a `src/components/**/*.test.tsx`.) For tests that need the day to advance mid-test, close over a mutable object instead of a fixed string: `const clock = { today: '2026-08-18' }` and read `clock.today` inside the mock factory.
- Canonical fixture date across the whole suite: **`2026-08-18`, a Tuesday.** Fortnight fixtures anchor on Monday `2026-08-10` or `2026-08-17`. Reuse these unless the test specifically needs a different day-of-week.
- Component tests seed via `seedApp()` from `src/test/seed.ts`. Store-only tests inline an equivalent `reset()`.
- Queries are role/label-based (`getByRole('button', { name: '...' })`, `getByLabelText('...')`) — when adding a new interactive element, give it an accessible name, not a test-id.

**Why.** Consistency here is what lets a new test file "just work" by copying the pattern from a neighboring one.

### INV-11. The dynamic import in `src/test/setup.ts` is load-bearing — do not "clean it up"
**Rule.** The global `afterEach` in `src/test/setup.ts` uses `const { appStorage } = await import('../store/store')` — a **dynamic** import inside the callback, not a static top-level `import`.
**Why.** Vitest's `setupFiles` execute *before* a test file's own (hoisted) `vi.mock('./clock', ...)` runs. A static top-level import of `../store/store` here would link `store.ts` — and transitively `clock.ts` — to the *real* clock module before any per-test mock is registered, silently breaking clock mocking for every store test. The dynamic import resolves lazily inside `afterEach`, after the test file's own module graph (including its `vi.mock`) has already been evaluated, so it reuses that same cached, correctly-mocked instance.
**Check.** If you ever see store tests getting real dates instead of the mocked `2026-08-18`, this is the first thing to check.

### INV-12. CSS Modules: 1:1, tokens only, `:has()` not duplicate attributes
**Rule.**
- Every component with markup has exactly one colocated `<ComponentName>.module.css`, imported as `styles`. No `composes:`, no `:global`.
- All colors, spacing, type sizes, radii, and shadows come from `src/styles/tokens.css` custom properties — no hard-coded hex/rgb values in a component module. (The `Modal` scrim's `rgba(...)` is the one legitimate exception, for opacity.)
- Dark mode is the CSS `light-dark()` function: every color token in `tokens.css` is declared **once** in `:root` as `light-dark(lightValue, darkValue)`; the mode is selected by `color-scheme` — the OS preference by default, overridden by `:root[data-theme='light'|'dark']` (attribute absent = follow the OS). The only JS theme state is the **ephemeral** `theme` field + `setTheme` action; `src/store/theme.ts` owns the `agile-todo-app.theme` localStorage key (deliberately outside the zustand blob — the FOUC-preventing inline script in `index.html` reads it pre-React) and the `data-theme` attribute. Never branch on theme in a component — add a `light-dark()` token instead. `tokens.test.ts` splits every pair and enforces WCAG contrast per mode.
- When a parent needs to style based on a child's semantic state, reach into the child with `:has()` (e.g. `.item:has([data-priority='high'])`) rather than duplicating the attribute onto the parent. This was made explicit after a real bug — see `src/components/notes/NoteCard.module.css` for the pattern.

**Why.** This is what makes dark mode and design changes a token edit instead of a component-by-component chase, and what keeps CSS Modules from accumulating global leakage over time.

### INV-13. Semantic `data-*` attributes are public API
**Rule.** `data-priority` (`'high'|'medium'|'low'`), `data-category` (`'blocker'|'info'`), `data-done`, `data-resolved`, `data-today` are read by both CSS and tests — treat renaming or removing one as a breaking change. Boolean/presence attributes use the pattern `cond ? '' : undefined` — **never `data-x={false}`**, which React renders as the literal string `data-x="false"`, and CSS/test selectors like `[data-x]` still match it. `data-today` is paired with a real accessible indication — `FortnightTape.tsx`'s day-chip `aria-label` appends " (today)" after the visible-text prefix, the full date, and the pending-todo count, per WCAG 2.5.3 Label in Name (the visible chip text must stay a literal substring of the accessible name, never be replaced by it); its folded-week buttons extend the same `data-today` vocabulary additively (present when the folded week *contains* today) rather than inventing a new attribute, paired with an " (includes today)" label suffix — the attribute alone is never sufficient for screen-reader users, only for CSS/tests. `FortnightTape` no longer renders per-todo `data-priority`/`data-done` segments (removed in the accordion redesign, see `docs/superpowers/specs/2026-08-11-tape-accordion-blocker-rollover-design.md`) — those two attributes remain public API on `TodoItem` and `PriorityBadge`, just not on the tape anymore.
**Why.** Tests assert against these directly; a rename that "looks cosmetic" breaks the suite in confusing ways if you don't grep for the old value first.
**Note.** Don't treat a `data-*` attribute's presence as proof it's load-bearing — check whether anything actually selects on it (`grep` for `[data-x]` in both `*.module.css` and `*.test.tsx`) before relying on or "preserving" one you haven't verified. `TodoItem`'s `data-overdue` was exactly this trap (dead, `TD-8`) until it was removed in the studio-console redesign.

## Recipes

### Change persisted state (highest-risk ritual — 6 steps)
1. Edit `PersistedState` in `src/domain/types.ts`.
2. Bump `SCHEMA_VERSION` in `src/store/migrations.ts`.
3. Add a migration step to `defaultSteps`, **keyed by the source version** (the version you're migrating *from*).
4. Add the new field to `partialize` in `src/store/store.ts` — **this is the step it's easiest to forget** (see INV-6).
5. Extend `validatePersistedState` in `src/store/exportImport.ts` to check the new field.
6. Write a test that migrates from the old schema version, and a round-trip export → import test.

### Add a feature (domain → store → component, TDD each hop)
Write the failing domain test first (pure function, `src/domain/`). Implement it. Then the store test (the action/selector that wires it into state). Then the component test. Don't reach for a component-level test to prove domain logic — if a domain function needs 6 cases, those are 6 fast, isolated domain tests, not 6 slow RTL renders.

### Add a component
One folder per feature area under `src/components/`. `.tsx` + `.module.css`, 1:1. Put its test in that feature's existing test file (e.g. a new todos-related component's test goes in `todos.test.tsx`, not a new file) unless it's genuinely a new feature area. If it renders anything that mutates state, accept `readOnly: boolean` as a prop (see INV-9) rather than deriving it internally.

### Debug a date bug
First question, always: **is this a scheduling date (`ISODate`, local, `"YYYY-MM-DD"`) or a timestamp (`ISODateTime`, UTC)?** Most date bugs in this codebase are that confusion — see INV-1. `LocalDateTime` (reminders) is the third, rarer case.

## Never do this

A scannable version of the invariants above — this is deliberately redundant with them, and it's exactly what `.claude/hooks/check-invariants.mjs` enforces on every edit:

- `toISOString().slice(0, 10)` or any UTC-string date-slicing
- `new Date()` (no args) or `Date.now()` outside `src/store/clock.ts` / `src/hooks/useNow.ts`
- an import from `../store` (or anything non-sibling) inside `src/domain/`
- `data-x={false}` — use `data-x={cond ? '' : undefined}`
- `vi.setSystemTime` to mock the clock — mock the `./clock` module instead
- importing `describe`/`it`/`expect`/`vi` — they're global
- a hard-coded hex/rgb color in a `.module.css` — use a token
- `composes:` or `:global` in a `.module.css`
- adding a runtime dependency (the set is deliberately 3 packages: `react`, `react-dom`, `zustand`) — ask first
- a static top-level `import` of `../store/store` in `src/test/setup.ts` (see INV-11)

## Known tech debt

See [`docs/TECH-DEBT.md`](docs/TECH-DEBT.md) — roughly 15 triaged, deliberately parked items. Don't fix them opportunistically mid-feature; if you want to fix one, do it as its own commit with its own test, and delete its row.
