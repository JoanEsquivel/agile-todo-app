# Monthly Board Redesign — Design Spec

**Amendment to [`2026-08-10-agile-todo-app-design.md`](2026-08-10-agile-todo-app-design.md)**

**Date:** 2026-08-10
**Status:** Approved by user

## Scope

This document amends three things in the original spec: the board grid (§9, `FortnightBoard`), the scheduling horizon (§6, `generateFortnightDays`), and the navigation UI (§9, `DayStrip`/`FortnightTape`). It also adds a one-time backward-compatibility rule for users with existing persisted state.

**Everything else in the original spec is unchanged and remains authoritative**, including: daily rollover (`applyRollover`), standup (`buildStandup`/`formatStandup`), reminders (`partitionReminders`), the pomodoro feature, export/import, `guardedStorage`, and INV-9's read-only-history rules. Where this document doesn't mention a function, action, or invariant, assume it is untouched — do not re-derive it from first principles.

This is a design/product spec, not an implementation plan. The migration mechanics (schema v3, the in-place active-period rewrite) are **decided here as product requirements** and implemented in a later task (Task 4 of the redesign plan); this document does not specify the migration's code shape.

## 1. Three decisions

### 1.1 Board: always 3 aligned columns

Today, `FortnightBoard`'s CSS grid (`FortnightBoard.module.css`) falls back from 3 columns to 2 via `.board:not(:has(aside))` when `RemindersPanel` renders `null` (no reminders for the selected day), and `DayColumn` duplicates the same `--space-5` gap in a second, nested grid to keep Todos/Notes visually aligned with the outer 3-track grid.

**Decision:** the board is **always 3 fixed columns** (Todos | Notes | Reminders) on desktop (≥1024px, matching the existing breakpoint). Reminders always renders a track — an empty "No reminders" state instead of `null` — so the `:not(:has(aside))` 2-column fallback is removed entirely. Column alignment uses CSS `subgrid` (or an equivalent single-source-of-truth gap token) instead of two independently-maintained grids, so the gap value only needs to be correct in one place.

Mockup (desktop, ≥1024px):

```
┌─────────────┬─────────────┬─────────────┐
│ TODOS       │ NOTES       │ REMINDERS   │
│ ☐ Deploy…   │ ⚑ Blocker…  │ ⏰ 14:00 …  │
│ ☐ Review…   │ ℹ Info…     │             │
│ ☑ Fix…      │             │ (if empty:) │
│             │             │ "No         │
│             │             │  reminders" │
└─────────────┴─────────────┴─────────────┘
Never jumps 2↔3 columns; widths stay stable.
```

Below 1024px, the existing stacked/responsive layout is unaffected by this amendment.

### 1.2 Horizon: fortnight → calendar month

**Decision:** the scheduling horizon changes from a fixed 10-workday fortnight to the **workdays of the calendar month containing the anchor date** — 20–23 days depending on the month, with the first and/or last week possibly partial (not necessarily starting/ending on Monday/Friday).

This is a single-function change: the length lives entirely in the generation function (the fortnight-length amendment to `generateFortnightDays`, §2 below). Every other domain/store function that currently reasons about a fortnight — `effectiveBoardDay`, `carryOverTodos`, `applyRollover`, `buildStandup`, `partitionReminders`, and the store selectors — is **already length-agnostic** in its current implementation (none of them hard-code `10`, index `days[9]`, or otherwise assume a fixed count) and must **remain** so. No behavior change is required in those functions; this is a constraint on the redesign, not new work — but any edit touching them must not introduce a fixed-length assumption.

### 1.3 Navigation: redesigned tape, no ‹ › buttons

**Decision:** `FortnightTape` (component name unchanged — see §4 Naming) shows **every day of the active period**, grouped by week with visual wrap, instead of a fixed-size window. Each day is a compact chip (weekday abbreviation + day-of-month number). A single progress indicator reads "Day N of M" with a filled progress bar, computed from the effective board day's position among the period's days. The previous/next navigation buttons are removed — with the full month visible and wrapped by week, they have no remaining job.

Mockup (August 2026, 21 workdays, wrapped by week):

```
┌──────────────────────────────────────────────────────┐
│ Day 12 of 21  ▓▓▓▓▓▓▓▓▓░░░░░░░                       │
│ ┌───┬───┬───┬───┬───┐ ┌───┬───┬───┬───┬───┐          │
│ │Mon│Tue│Wed│Thu│Fri│ │Mon│Tue│Wed│Thu│Fri│  (wrap)  │
│ │ 3 │ 4 │ 5 │ 6 │ 7 │ │10 │11 │12 │13 │14 │          │
│ │▂▄ │▂  │   │▄  │▂▂▄│ │▂  │   │▄▄ │   │   │          │
│ └───┴───┴───┴───┴───┘ └───┴───┴───┴───┴───┘          │
│ ┌───┬───┬───┬───┬───┐ ┌───┬───┬───┬───┬───┐ ┌───┐    │
│ │17 │18●│19 │20 │21 │ │24 │25 │26 │27 │28 │ │31 │    │
│ └───┴───┴───┴───┴───┘ └───┴───┴───┴───┴───┘ └───┘    │
│  today=● · selected=filled/ink · no ‹ ›              │
└──────────────────────────────────────────────────────┘
```

A legacy 10-day fortnight in history renders with the **same** tape component (2 groups of 5, no progress indicator since it isn't the active period — see §3).

The per-day activity marks (the small bar segments under each day number, e.g. `▂▄`) and the roving-tabindex keyboard handling already described in `CLAUDE.md`'s Keyboard model section are unchanged by this amendment.

## 2. Calendar-month semantics

`generateFortnightDays`'s replacement (name TBD at implementation time — see §4) computes: **all workdays (Mon–Fri) of the calendar month that contains `anchor`**, ascending, using the same local-date rules as today (INV-1, INV-4 unchanged: weeks start Monday, `toISODate`-derived local dates only).

### Weekend-tail roll-forward

If `anchor` falls **after** the last workday of its calendar month (e.g. a Saturday/Sunday following the month's final Friday), the generator must **not** return that now-fully-past month. It rolls forward and returns the workdays of the **next** calendar month instead.

**Why this matters:** without this rule, "Generate new month" run on such a weekend would anchor to a month whose `effectiveBoardDay` is immediately `null` (already expired) — the user would see a brand-new period that is instantly stale, and pressing "Generate" again would recompute the *same* expired month, looping. Rolling forward on generation is what keeps "Generate new month" always producing a period that contains at least one live day.

This mirrors the existing weekend-anchor handling in `mondayOfWeek`/`effectiveBoardDay` (INV-4) — it's the same category of edge case (anchor falls in dead time) applied to month boundaries instead of week boundaries.

## 3. In-place migration of the active period (schema v3)

**Product requirement, decided here; implemented in a later task.**

The user has real data in `localStorage` today, keyed by the current 10-day-fortnight format. On upgrade:

- The **active** period is rewritten **in place** to contain the calendar-month workdays (per §2) of the month containing "today" at migration time — **same `id`**, new `days`.
- Existing todos/notes on the active period are **kept**, not recreated. Any whose `scheduledDay`/`day` falls outside the new day set is recomputed onto the new period the same way `carryOverTodos` already relocates out-of-range days (past → effective board day; future-but-now-out-of-range → nearest valid handling per that function's existing rules) — this document does not redefine that relocation logic, only requires that it run once, during migration, over the active period's own todos/notes.
- **Closed/historical periods are never touched.** Every period in `fortnights` other than the active one keeps its original 10 workdays exactly as persisted, and remains navigable in read-only mode (INV-9 unchanged).
- Consequence for every component and selector: **a period's `days.length` is not a reliable signal of anything** (not "is this active", not "is this legacy") — it can legitimately be 10 (history, or a short month edge case is not expected but not forbidden either) or ~20–23 (active, post-migration). UI code must never branch on length, index a fixed offset (`days[9]`), or assume Monday-start/Friday-end for the first/last element. This generalizes the length-agnostic requirement from §1.2 to migrated data specifically: the same `FortnightTape`, `FortnightBoard`, `DayColumn`, standup, and reminder code paths render both a 10-day legacy period and a ~21-day active period correctly, with no special-casing by length.

This is schema v3 (`PersistedState.schemaVersion`); the concrete migration step, its test, and its wiring into `defaultSteps`/`partialize`/`validatePersistedState` (per `CLAUDE.md`'s "Change persisted state" recipe) belong to the implementation task, not this spec.

## 4. Naming: user-visible only

Only **user-facing text** changes from "fortnight" to "month" — button labels, banners/toasts, `aria-label`s, and any other string a user reads (e.g. "Generate new fortnight" → "Generate new month", the active-period header text, screen-reader announcements).

**Internal names are unchanged and stay unchanged deliberately:** types (`Fortnight`), fields (`fortnightId`, `activeFortnightId`, `viewedFortnightId`), files and components (`FortnightBoard.tsx`, `FortnightTape.tsx`, `FortnightSwitcher`, `fortnight.ts`), store actions (`regenerateFortnight`, `viewFortnight`), and test names all keep their existing "fortnight" naming. This is intentional legacy naming, not an inconsistency to "fix" — renaming the internal API surface is out of scope for this redesign and would multiply the diff for zero user-facing benefit. A future contributor grepping for `fortnightId` should expect to find it; a future contributor reading the UI should never see the word "fortnight."

## 5. Out of scope (unchanged by this amendment)

Everything the original spec §6–§10 defines and this document doesn't explicitly override: `applyRollover`'s day-level rollover logic, `buildStandup`/`formatStandup`, `partitionReminders`, the pomodoro feature and its store slice, theme/dark-mode (INV-12), export/import and its validation (INV-8), `guardedStorage` (INV-7), and INV-9's read-only-history rules (`selectIsReadOnly`, `setComposeIntent`'s refusal, the `DayColumn` `useEffect` reset). None of these are touched by the 3-column board, the calendar-month horizon, or the redesigned tape.
