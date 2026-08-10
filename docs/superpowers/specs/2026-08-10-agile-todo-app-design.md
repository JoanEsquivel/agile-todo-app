# Agile Todo App — Design Spec

**Date:** 2026-08-10
**Status:** Approved by user
**Companion plan:** `docs/superpowers/plans/2026-08-10-agile-todo-app-implementation.md`

## Context

Agile Todo App is a todo app that lives entirely in the browser: no backend, no network calls, data survives browser restarts (lost only on browser reinstall / data wipe), fast, professional UI/UX. It is organized around a **fortnight (2-week) board** with a regenerate button, a daily standup modal, priorities, notes, and reminders.

Decisions confirmed with the user during brainstorming:

| Topic | Decision |
|---|---|
| Fortnight span | Current week + next week, **workdays only (Mon–Fri, 10 days)**, weeks start Monday, anchored to generation date |
| Regenerate | New fortnight anchored to today's week; **incomplete todos carry over automatically**; old fortnights = read-only history |
| Daily rollover | Incomplete todos from past days auto-move to today with a "rolled over" indicator |
| Reminders | Optional field on each todo; **visual in-app only** (Upcoming/Overdue panel + badges), no Web Notifications |
| Notes | Standalone per-day notes, category `blocker` (resolvable) or `info` |
| Standup "yesterday" | Previous **workday** (Monday shows Friday, plus weekend completions) |
| Stack | React 18 + TypeScript + Vite, Zustand + persist, localStorage, Vitest + RTL, TDD |
| UI language | English |

## 1. Guiding principles

- **Pure domain core**: all date math, fortnight generation, rollover, carry-over, standup and reminder computation are pure functions in `src/domain/` that take `today`/`now` as explicit parameters. Zero React, zero storage, zero ambient `Date.now()` — trivially unit-testable (essential: implementation is TDD-driven).
- **Thin store**: Zustand orchestrates domain functions and holds state; components stay dumb and select narrowly.
- **One persisted document**: a single versioned JSON blob in localStorage, migrated on load, debounced on write.

## 2. State management: Zustand

- `zustand/middleware` `persist` provides versioned storage + a `migrate(persisted, version)` hook out of the box — exactly the schema-versioning requirement.
- Selector-based subscriptions avoid Context re-render storms (ticking reminder clock, per-todo edits) — satisfies "must be fast".
- Store usable outside React (`useAppStore.getState()`): store actions testable without rendering; the midnight-detection interval can dispatch without hooks.
- ~1 KB, one dependency, no provider nesting.

## 3. Folder structure

```
agile-todo-app/
├── index.html
├── package.json / tsconfig.json / vite.config.ts   (vitest config in vite.config.ts)
├── src/
│   ├── main.tsx                 # bootstrap: init store, navigator.storage.persist()
│   ├── App.tsx                  # shell: header, board, panels, modals, init effects
│   ├── domain/                  # PURE — no React, no storage, no ambient time
│   │   ├── types.ts             # all shared TS types
│   │   ├── dates.ts             # local-date helpers on YYYY-MM-DD strings
│   │   ├── fortnight.ts         # generation, effectiveBoardDay, carryOverTodos
│   │   ├── rollover.ts          # applyRollover
│   │   ├── standup.ts           # buildStandup + formatStandup (clipboard text)
│   │   └── reminders.ts         # partitionReminders (upcoming/overdue)
│   ├── store/
│   │   ├── store.ts             # Zustand store: state + actions
│   │   ├── selectors.ts         # derived selectors
│   │   ├── clock.ts             # todayLocal(), nowIso() — ONLY ambient-time reader
│   │   ├── persistence.ts       # debounced localStorage adapter, flush on pagehide
│   │   ├── migrations.ts        # SCHEMA_VERSION, runMigrations(state, fromVersion)
│   │   └── exportImport.ts      # JSON export/import (validate + migrate)
│   ├── hooks/
│   │   ├── useNow.ts            # ticking "now" (30s) for reminder badges
│   │   └── useDayChangeWatcher.ts  # midnight/focus/visibility → checkDayTick()
│   ├── components/
│   │   ├── board/    FortnightBoard.tsx, DayStrip.tsx, DayColumn.tsx
│   │   ├── todos/    TodoItem.tsx, TodoForm.tsx
│   │   ├── notes/    NoteCard.tsx, NoteForm.tsx
│   │   ├── standup/  StandupModal.tsx
│   │   ├── reminders/RemindersPanel.tsx
│   │   ├── history/  FortnightSwitcher.tsx
│   │   └── common/   Modal.tsx, PriorityBadge.tsx, EmptyState.tsx
│   └── styles/       tokens.css + CSS Modules per component
└── (tests colocated: foo.test.ts next to foo.ts)
```

Styling: plain CSS Modules + `tokens.css` custom properties (colors, spacing, type scale). No UI framework — the frontend-design skill pass at the end works against hand-owned CSS.

## 4. Types (`src/domain/types.ts`)

```ts
export type ISODate = string;      // "YYYY-MM-DD", local calendar date. Sorts lexicographically.
export type ISODateTime = string;  // full ISO 8601 UTC (toISOString) — timestamps only
export type LocalDateTime = string;// "YYYY-MM-DDTHH:mm", no zone — reminders ("9am my time")

export type Priority = 'high' | 'medium' | 'low';
export type NoteCategory = 'blocker' | 'info';

export interface Todo {
  id: string;                 // crypto.randomUUID()
  fortnightId: string;
  title: string;
  description?: string;
  priority: Priority;
  scheduledDay: ISODate;      // must be one of its fortnight's days
  done: boolean;
  completedAt?: ISODateTime;
  createdAt: ISODateTime;     // never changes across rollover/carry-over
  rolledOver: boolean;        // set when auto-moved off a past day; cleared if user reschedules
  reminderAt?: LocalDateTime;
}

export interface Note {
  id: string;
  fortnightId: string;
  day: ISODate;
  category: NoteCategory;
  text: string;
  resolved: boolean;          // only meaningful for 'blocker'; always false for 'info'
  createdAt: ISODateTime;
}

export interface Fortnight {
  id: string;
  startDay: ISODate;          // Monday of week 1
  days: ISODate[];            // exactly 10 workdays, ascending
  createdAt: ISODateTime;
}

export interface PersistedState {
  schemaVersion: number;
  fortnights: Fortnight[];            // chronological; last = active
  activeFortnightId: string | null;
  todos: Record<string, Todo>;
  notes: Record<string, Note>;
  lastRolloverDay: ISODate | null;    // last local day rollover ran (idempotency)
}

// Store = PersistedState + ephemeral UI state (NOT persisted):
// viewedFortnightId, selectedDay, modal flags
```

- `todos`/`notes` are `Record<id, T>` for O(1) updates; day/fortnight views are derived selectors (data volume tiny).
- History is free: old fortnights stay in `fortnights`; their todos/notes keep their `fortnightId`. Read-only is a UI rule: editing disabled whenever `viewedFortnightId !== activeFortnightId`.

## 5. Date & time conventions

- **Scheduling** uses local date-only `YYYY-MM-DD` built from local `Date` fields (never `toISOString().slice(0,10)`, which shifts across UTC). Comparison = string comparison. Immune to timezone/DST skew.
- **Timestamps** (`createdAt`, `completedAt`) are UTC ISO; converted to local `ISODate` only at comparison time (`localDateOf(iso)`) — "completed yesterday" means yesterday *in the user's current timezone*.
- **Reminders** are zone-less local datetimes (from `<input type="datetime-local">`); `new Date("YYYY-MM-DDTHH:mm")` parses as local → overdue checks are simple wall-clock comparisons.
- All domain functions take `today: ISODate` / `now: Date` as parameters. `src/store/clock.ts` is the only ambient-time reader; tests inject values.

## 6. Domain contracts

**`dates.ts`** — `toISODate(d: Date)`, `parseISODate`, `addDays(day, n)`, `isWorkday(day)`, `mondayOfWeek(day)` (weeks start Monday; **Sunday belongs to the preceding week's Monday**), `previousWorkday(day)`, `nextWorkday(day)`, `localDateOf(isoDateTime)`, display formatters.

**`fortnight.ts`**
- `generateFortnightDays(anchor: ISODate): ISODate[]` — Monday of `anchor`'s week + 10 workdays (Mon–Fri × 2). Pure; caller supplies id/timestamp.
- `effectiveBoardDay(fortnight, today): ISODate | null` — the day the board treats as "today":
  - `today` if it's in `fortnight.days`;
  - weekend mid-fortnight → next workday (upcoming Monday);
  - `today < startDay` → first day; `today >` last day → **`null`** (expired → drives "generate new fortnight" banner and disables rollover).
- `carryOverTodos(todos, oldFortnightId, newFortnight, today): Todo[]` — for every `!done` todo of the old fortnight:
  - if `scheduledDay` exists in `newFortnight.days` **and** `scheduledDay >= effectiveBoardDay(newFortnight, today)` → keep the day, reassign `fortnightId` only (mid-fortnight regeneration overlaps one week; future plans must not be yanked to today);
  - otherwise → `scheduledDay = effectiveBoardDay(...)`, new `fortnightId`, `rolledOver = true` if it came from a past day. `createdAt`/`reminderAt` untouched. **Done todos stay in the old fortnight** (that is the history).

**`rollover.ts`**
- `applyRollover(todos, fortnight, today): { todos; changed: boolean }` — for `!done` todos of the *active* fortnight with `scheduledDay < today`: set `scheduledDay = effectiveBoardDay(fortnight, today)`, `rolledOver = true`. **No-op when `effectiveBoardDay` is `null`** (expired) — migration then happens exclusively via `carryOverTodos` at regeneration. This split prevents double-migration.

**`standup.ts`**
- `buildStandup(todos, notes, activeFortnightId, today): StandupData`, with `E = isWorkday(today) ? today : nextWorkday(today)`:
  - **Yesterday**: todos `done` with `localDateOf(completedAt)` in half-open range `[previousWorkday(E), E)` — Monday's standup shows Friday *plus weekend completions*; Tuesday shows only Monday.
  - **Today**: todos with `scheduledDay === E` (done ones render struck-through).
  - **Blockers**: all unresolved `blocker` notes in the active fortnight (a Tuesday blocker still blocks on Thursday).
- `formatStandup(data): string` — plain text with `*Yesterday*` / `*Today*` / `*Blockers*` headers, `- ` bullets, "None" for empty sections. Slack-paste friendly.

**`reminders.ts`**
- `partitionReminders(todos, now): { overdue; upcoming }` — `!done` todos with `reminderAt`, split by `reminderAt <= now`, each sorted by time. Rolled-over todos keep `reminderAt` untouched: a past reminder shows as Overdue until done or edited — no rescheduling magic.

## 7. Store actions

- `initApp()` (once, from `main.tsx` after rehydration): no active fortnight → create one anchored to today; else `checkDayTick()`. Fire-and-forget `navigator.storage.persist()`.
- `checkDayTick()`: if `todayLocal() !== lastRolloverDay` → `applyRollover` on active fortnight, stamp `lastRolloverDay`, reset `selectedDay` to effective board day. **Idempotent** — safe from init, a 60s interval, `visibilitychange`, and `focus` (covers tab-open-across-midnight).
- `regenerateFortnight()`: build fortnight anchored to today → `carryOverTodos` → append, set active, stamp `lastRolloverDay`, jump view to new fortnight. Works mid-fortnight or after expiry; old fortnight becomes read-only history automatically.
- CRUD: `addTodo`, `updateTodo`, `toggleDone` (sets/clears `completedAt`), `deleteTodo`, `rescheduleTodo` (clears `rolledOver`), `addNote`, `updateNote`, `resolveBlocker`, `deleteNote`. UI: `selectDay`, `viewFortnight`.

## 8. Persistence

- Zustand `persist`: `name: 'agile-todo-app.v-state'`, `version: SCHEMA_VERSION` (starts at 1), `migrate: runMigrations` (a `Record<number, (s) => s>` applied in sequence), `partialize` strips ephemeral UI fields.
- Custom `StateStorage` over localStorage: **trailing-debounce writes (300 ms)** + synchronous flush on `pagehide`/`beforeunload`.
- **Export**: downloads `agile-todo-app-backup-<date>.json` = exact persisted document (includes `schemaVersion`). **Import**: parse → structural validation (small hand-rolled `validatePersistedState`) → `runMigrations` if older → replace state → immediate flush. Newer-schema files rejected with a readable error.

## 9. UI composition

- **App shell**: header (title "Agile Todo", active fortnight range, `Standup` button, `Generate new fortnight` button with confirm dialog, fortnight history switcher, export/import). Main: `FortnightBoard`; side/bottom: `RemindersPanel`.
- **FortnightBoard**: `DayStrip` of 10 day chips (todo counts, effective-today highlight, prev/next nav) + one focused `DayColumn` (todos + notes for `selectedDay`). Expired banner when `effectiveBoardDay` is null. Read-only mode when viewing history.
- **TodoItem**: checkbox, title, priority badge, rolled-over indicator, overdue-reminder badge (via `useNow`), edit/delete. **TodoForm**: title (required), description, priority, day picker limited to fortnight days, optional reminder.
- **NoteCard**: category-styled (blocker/info), resolve toggle for blockers. **StandupModal**: three sections + Copy to clipboard (`navigator.clipboard.writeText(formatStandup(...))` + "Copied" confirmation). **RemindersPanel**: Overdue then Upcoming; click focuses the todo's day.

## 10. Edge-case decisions

| Case | Decision |
|---|---|
| Opened on a weekend | Board highlights `effectiveBoardDay` = next Monday. Standup uses `E = nextWorkday(today)`: Yesterday = Friday (+ weekend completions), Today = Monday's todos. |
| First use on a weekend | Fortnight anchors to Monday of the *current* week (Sat/Sun belong to the week started the previous Monday); effective day = next Monday. No special-casing needed. |
| Regenerate mid-fortnight | New fortnight = current week + next (overlaps old week 2). Incomplete todos on overlapping *future* days keep their dates; past/non-overlapping move to effective today. |
| Rollover × carry-over double-migration | Rollover only runs while today is inside the active fortnight (`effectiveBoardDay !== null`); after expiry it no-ops and a banner prompts regeneration, where `carryOverTodos` is the sole migrator. Both paths stamp `lastRolloverDay`. |
| Tab open across midnight | 60s interval + `visibilitychange` + `focus` all call idempotent `checkDayTick()`. |
| Reminder on rolled-over todo | `reminderAt` never auto-changes; past reminders show as Overdue until done/edited. |
| Timezone / DST | Local-only `YYYY-MM-DD` for scheduling (string compare), UTC ISO timestamps localized at read time, zone-less local reminders. No UTC date-slicing anywhere. |
| Import newer-schema file | Rejected with clear error. Older files migrate. |
| Editing while viewing history | Impossible — history views render controls disabled/hidden. |

**YAGNI (explicitly out of scope)**: drag-and-drop, search/filter, tags, Web Notifications, service worker, router, multi-user.
