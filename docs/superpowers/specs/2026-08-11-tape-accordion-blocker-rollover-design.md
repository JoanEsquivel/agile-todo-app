# Day Bar Accordion + Blocker Rollover — Design Spec

Amends [`2026-08-10-monthly-board-redesign-design.md`](2026-08-10-monthly-board-redesign-design.md), which introduced the calendar-month tape this spec restyles, and touches the rollover/carry-over rules that same spec explicitly left unchanged.

## Scope

Two independent changes, bundled because they were requested and reviewed together:

1. **`FortnightTape` becomes an accordion.** The ~21-day calendar-month tape (redesigned in the amended spec above) had grown visually disordered: uneven chip widths/heights, wrapped rows with no week alignment, per-todo priority segment bars adding noise. This restyles it — same data, same navigation model, no change to scheduling rules.
2. **Blocker notes gain rollover and carry-over.** A real gap found during review: unresolved blocker notes never moved with the day or the month, so a blocker left on a past day could silently become invisible on the board and, once a new month was generated, permanently unresolvable (its old month is read-only). This gives blockers the same daily-rollover and month-boundary carry-over treatment todos already have.

## 1. FortnightTape: accordion layout

### 1.1 Mechanism

The week containing `selectedDay` renders **expanded** — its day chips share the row's width equally. Every other week renders **folded** to one compact button showing its date range (e.g. `3–7`). There is no separate "expanded week" state: which week is expanded is derived from `selectedDay` alone (`fn.days.includes(selectedDay)` guards against a stale value degrading to zero expanded weeks). Clicking a folded week selects its first day, which re-derives expansion — no new store field.

```
┌────┐┌──────┐┌───────────────────────────────┐┌───────┐┌────┐
│3–7 ││10–14 ││ Mon   Tue   Wed   Thu   Fri    ││24–28  ││ 31 │
│    ││      ││ 17   [18]   19    20    21     ││       ││    │
└────┘└──────┘└───────────────────────────────┘└───────┘└────┘
Day 12 of 21  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░
```

### 1.2 Removed: per-todo priority segments

The stacked priority-colored segment bars under each day are gone. In their place, a single discreet number: the count of **not-done** todos for that day (nothing rendered at 0). A folded week shows the same count, aggregated across its days. This is a presentation change only — `selectDayWorkload` (the selector) is unchanged; the tape now derives `pending = segments.filter(s => !s.done).length` instead of rendering `segments` directly.

### 1.3 Chip sizing: uniform regardless of week length

A day chip's `max-width` is capped at 20% of its (already-full-width) week container — one day's fair share of a typical 5-day week — rather than letting `flex-grow` divide 100% of the row among however many days are actually present. Without this, the month's last week (often a single day, e.g. just Aug 31) would render as one chip stretched across the entire remaining row width. With the cap, every chip stays a consistent size and a short week just leaves its own slot partly empty — the tape trailing off, not a jump-scare-sized chip.

### 1.4 Focus management across a fold

Arrow keys and Home/End still move `selectedDay` across the *whole* month, not just the expanded week — crossing a week boundary collapses the old week and expands the new one mid-navigation. The day chip a keyboard user is about to land on doesn't exist in the DOM yet when the keydown fires (its week isn't expanded until the resulting render commits), and the currently-focused chip is about to unmount. A synchronous `.focus()` call (the previous implementation's approach) can't reach a node that isn't mounted yet.

Fix: a `pendingFocus` ref records the target day; a plain `useEffect` (no dependency array, so it runs after every commit) focuses it and clears the ref. A folded week's `onClick` sets the same ref before calling `selectDay`, since a mouse click on a folded button also unmounts that button once its week expands.

### 1.5 Accessibility contract

- Day chip visible text (`"Tue 18"`) stays a literal prefix of its accessible name (WCAG 2.5.3, same pattern as before): `"Tue 18 — Tue, Aug 18, 3 pending (today)"`.
- Folded week visible text (`"3–7"`, or just `"31"` for a single-day week — never `"31–31"`) is likewise a literal prefix: `"3–7 — Week of Mon, Aug 3, 5 pending (includes today)"`.
- Exactly one control in the whole nav — a day chip or a folded week — is a tab stop at any time (roving tabindex, unchanged principle, now spanning two control types instead of one).
- `data-today` / `aria-current='date'` keep their existing meaning and are the same public `data-*` vocabulary (INV-13); a folded week additionally gets `data-today` when it *contains* today, paired with the `(includes today)` label suffix — the attribute alone is never the accessible indication.

### 1.6 What didn't change

`chunkByWeek` (real calendar-week chunking, INV-4), `selectDayWorkload`, the length-agnostic contract (a legacy 10-day history fortnight renders as 1 expanded + 1 folded week, same mechanism as a 21-day month), the `Day N of M` progress block (still after `.weeks`, still only shown while viewing the active period).

## 2. Blocker note rollover and carry-over

### 2.1 Rules

Mirrors the todo rules (INV-5) with a note-specific filter — only **unresolved blockers** move; `info` notes and resolved blockers never do, since they carry no "still blocking" urgency and the standup already surfaces unresolved blockers regardless of which day they're pinned to.

- **Daily rollover** (`applyNoteRollover`, sibling of `applyRollover`): an unresolved blocker of the *active* fortnight with `day < today` moves to the effective board day, flagged `rolledOver`. Never writes `fortnightId`. No-ops when the period is expired.
- **Month-boundary carry-over** (`carryOverNotes`, sibling of `carryOverTodos`): on `regenerateFortnight`, an unresolved blocker whose `day` is inside the new month and still in the future keeps its `day`, only `fortnightId` changes; otherwise it moves to the new month's effective day, flagged `rolledOver`. Resolved blockers and info notes stay in the old (now read-only) fortnight as history — same as `done` todos.

Both are called only from `checkDayTick` and `regenerateFortnight`, which already own the `lastRolloverDay` once-per-day latch (INV-5) — no new call site, so the latch protects notes exactly as it protects todos.

### 2.2 What this fixes

Before this change, an unresolved blocker's `day` never moved. It stayed correct in the standup (fortnight-scoped, not day-scoped) but was invisible on the board once its day scrolled out of view, and — the actual bug — once a new month was generated, the blocker's `fortnightId` stayed pinned to the now-read-only old month. `selectIsReadOnly` then permanently hid its Resolve and Delete controls, and the standup filters by `activeFortnightId`, so the blocker also silently stopped appearing there. It became a permanently invisible, permanently unresolvable orphan — the same failure shape INV-9 exists to prevent for compose forms, just reached a different way.

### 2.3 Schema

`Note` gains `rolledOver?: boolean` (optional, `undefined` ≡ `false`). **No `SCHEMA_VERSION` bump** — `validatePersistedState` never inspects individual note fields, only that `notes` is an object, and `partialize` persists the `notes` record wholesale as one of `PersistedState`'s 7 top-level fields. The INV-6 ritual applies to *top-level* `PersistedState` field changes; this is a new optional field on a nested value type, which needs no migration step in either direction (old data reads the field as `undefined`/falsy; a new backup's extra field is invisible to an older app's validator, which never inspects it).

### 2.4 UI

`NoteCard` shows a "Rolled over" badge (reusing `--color-rollover`/`--color-rollover-bg`, already contrast-tested) when `note.rolledOver` — the same treatment `TodoItem` already gives rolled-over todos — visible in read-only history too, since a past month's rolled-over-*before-it-carried-over* blockers can still be browsed there.

## 3. Out of scope (unchanged by this amendment)

Rollover/carry-over of todos, the standup's fortnight-scoped (not day-scoped) blocker filter, `chunkByWeek`/`generateMonthDays`/`effectiveBoardDay`, the read-only history model (INV-9), the schema-change ritual for genuine top-level `PersistedState` changes (INV-6).

## 4. Testing

TDD per the standard recipe (domain → store → component): `rollover.test.ts`/`carryOver.test.ts` gained sibling `describe` blocks for the note functions; `dayTick.test.ts` covers the store wiring; `notes.test.tsx` covers the badge. The tape's DOM contract changing (fewer, larger day-chip buttons; new folded-week buttons) required renegotiating pinned assertions in `a11y.test.tsx`, `App.test.tsx`, `board.test.tsx`, and `history.test.tsx` — all rewritten to assert against the new contract rather than the old one, with the same underlying behaviors (roving tabindex, Home/End, read-only gating) re-proven under the new DOM shape. `tokens.test.ts` lost the three priority-on-`--color-surface-sunken` contrast pairs, whose sole reason for existing was the now-deleted segment track.
