# Three-Month Window + Automatic Month Rollover — Design

**Date:** 2026-08-11
**Status:** Approved
**Amends:** [`2026-08-10-monthly-board-redesign-design.md`](2026-08-10-monthly-board-redesign-design.md) — specifically its manual "Generate new month" flow (button, confirm dialog, expired banner, palette action) and its unbounded, dropdown-navigated history. Everything else in that spec (board grid, scheduling horizon, tape) stands.

## Goal

Remove all human interaction from month transitions, and bound history to a fixed window:

1. **Automatic month generation.** When the active month ends, the next one is generated automatically on the first day tick — no button, no confirmation.
2. **Fixed 3-month window.** The app retains the current month plus the 2 previous months. When a new month is generated, anything older is pruned — the period *and* its todos/notes — permanently and silently.
3. **Month-by-month navigation.** The history dropdown is replaced by a stepper (`‹ August 2026 ›`) that moves one month at a time. Navigating to the current month selects today's day (past months land on their first day, read-only as before).

## Non-goals

- No keyboard shortcut for month navigation (can be added later: one `useShortcuts` case + one `ShortcutsOverlay` row).
- No backup/undo mechanism for pruned data. Pruning is silent by explicit product decision; the existing manual Export button is the backup path. Auto-downloading before prune was considered and rejected (prune fires on app load with no user gesture; browsers block or mangle gesture-less downloads).
- No schema change, no rename of the legacy `Fortnight*` identifiers.

## Design

### 1. Retention model

Retention is counted **by calendar month, not by array entries**: the **3 newest calendar months actually present among stored periods** (capped at `month(today)`; later months — the weekend-tail active month — are always retained) are kept; every period belonging to an older month is dropped. In the steady state (consecutive months) this is identical to "intersects `{month(today), −1, −2}`"; it differs only after a usage gap, where it implements §2's approved decision — the last actually-used months stay until new real months displace them, rather than being evicted by empty calendar time. Counting by month is also what keeps legacy 10-day fortnights honest — two of them inside one July count as *one* month of history, not two retention slots (INV-4: legacy periods persist unmigrated and stay navigable).

New pure function in `src/domain/fortnight.ts` (INV-3 — domain, no ambient time):

```
pruneToRetention(fortnights, todos, notes, today)
  → { fortnights, todos, notes }
```

- Drops every fortnight outside the window **and** every todo/note whose `fortnightId` belonged to a dropped fortnight. Leaving orphans is not neutral: `partitionReminders` and `buildStandup` scan all todos with no `fortnightId` filter, so orphaned items would surface in the Reminders panel and standup forever with no board to reach them from — the INV-9 orphan class.
- Never drops the active fortnight (hard invariant, asserted in tests).
- Must be tolerant of >3 months present (imported archives — see §4), never assertive about ≤3.
- Retained fortnights' todos/notes pass through byte-for-byte untouched.
- `src/domain/dates.ts` gains `firstOfPrevMonth` as a sibling of the existing `firstOfMonth`/`firstOfNextMonth` if the retention floor needs date arithmetic.

Pruning runs in exactly one place: the generation step of `checkDayTick` (§2). Never on import, never on rehydration, never in a migration.

If the currently *viewed* fortnight is among the pruned (tab parked on an old month for weeks), the same `set()` re-points `viewedFortnightId` and `selectedDay` to the active month — otherwise `selectViewedFortnight` returns `null` and tape/board/header cascade to a blank page.

### 2. Automatic generation in `checkDayTick`

`checkDayTick` (already called from `initApp`, a 60s interval, `visibilitychange`, `focus`, and `importState`) becomes the single pipeline:

```
checkDayTick(today):
  1. if no activeFortnightId → return (initApp owns first-run)
  2. EXPIRY CHECK — before the lastRolloverDay latch:
     if effectiveBoardDay(active, today) === null:
        newFn   = buildFortnight(today)          // jump directly; no ghost gap months
        todos   = carryOverTodos(todos, active.id, newFn, today)
        notes   = carryOverNotes(notes, active.id, newFn, today)
        pruned  = pruneToRetention([...fortnights, newFn], todos, notes, today)
        set({ ...pruned, activeFortnightId: newFn.id, lastRolloverDay: today,
              viewedFortnightId / selectedDay re-pointed if user was on active or a pruned month })
        return
  3. latch: if lastRolloverDay === today → return
  4. existing rollover path (applyRollover / applyNoteRollover), unchanged
```

Load-bearing decisions:

- **Expiry is evaluated before the latch.** `importState` copies `lastRolloverDay` verbatim from an untrusted backup and then calls `checkDayTick`. A backup with `lastRolloverDay === today` but an expired active month would otherwise early-return forever — and with the button gone there is no manual escape. No loop risk: `generateMonthDays` rolls a weekend-tail anchor forward, so a freshly generated month is never expired; a second evaluation in the same tick/session no-ops. Idempotence rests on that property, not only on the latch (the tick can fire 3× in a second: interval + focus + visibilitychange).
- **The generating `set()` stamps `lastRolloverDay`** — INV-5's regenerate rule, inherited verbatim: without it, a same-day second tick would run `applyRollover` over todos `carryOverTodos` just placed on future overlap days and yank them back to today.
- **Rollover and carry-over stay disjoint** (INV-5): on the tick where the month expires, `applyRollover` is already a no-op (it bails on expired fortnights); the expired branch runs *only* carry-over, the non-expired branch runs *only* rollover. `done` todos and resolved blockers stay pinned to their month; pending todos and unresolved blockers migrate.
- **Gap months are skipped** (approved decision): a user away from August to November gets exactly one new month (November) with their pending work carried to today. History keeps the last actually-used months until new real months displace them. No empty ghost months — they would instantly evict real history from the 3-slot window.
- **`regenerateFortnight` is not deleted.** It loses every UI door (button, dialog, palette) but stays as an internal store action sharing the generation body with `checkDayTick`. It is the read-only fixture in 9 test files (deleting it rewrites them all for zero product value) and doubles as a safety valve if auto-generation ever misfires.
- `initApp`'s defensive unknown-active-id recovery branch routes through the same helper for consistency (low priority — already-corrupt-state path).
- Expiry is computed inline with `effectiveBoardDay(active, today) === null` (already imported in `store.ts`). `selectFortnightExpired` and its 4 `App.tsx` call sites are deleted — importing it into `store.ts` would create a runtime import cycle with `selectors.ts`.

### 3. Navigation: `FortnightNav` replaces `FortnightSwitcher`

New component `src/components/history/FortnightNav.tsx` (+ 1:1 module CSS, INV-12), replacing `FortnightSwitcher.tsx` (deleted with its CSS). Keeps the `Fortnight` prefix — the project's deliberate legacy-naming rule.

- Renders `‹ <Month YYYY> ›` in the header slot the dropdown occupied. Approved mock: option A of the brainstorm (stepper with month label; "(current)" affix on the active month, mirrored by the existing read-only banner for past ones).
- Buttons have real accessible names — `Previous month` / `Next month` (INV-10: role/label queries, no test-ids). The label shows the viewed month's name; the header's existing date range stays as-is.
- Prev/next order is computed by sorting `fortnights` by `days[0]` — array order is only append-order by construction and tests deliberately violate it. Multiple legacy periods inside one month are each their own stepper stop (they are distinct periods with distinct boards); the stepper steps through periods in chronological order, bounded by the retention window. Two same-month legacy stops share a month label — the header's date range (which changes per stop) is what disambiguates them.
- Arrows disable at the bounds (oldest retained period / current month). With a single fortnight the component still renders, both arrows disabled (unlike the dropdown, which hid itself).
- Navigation calls `viewFortnight(id)` — never writes `viewedFortnightId` directly (INV-9 rule 2: no second door). `viewFortnight` already implements "current month → select today" (`effectiveBoardDay`) and "past month → first day", and already clears `composeIntent`.

Deleted from `App.tsx`: the "Generate new month" button + disabled/title logic, `confirmRegenerateOpen` state + `ConfirmDialog` usage, the `'generate-fortnight'` palette action, the "This month has ended" banner, the `selectFortnightExpired` import. `src/components/common/ConfirmDialog.tsx` then has zero consumers and is deleted with its CSS (its focus-defaults-to-Cancel test coverage goes with it).

### 4. Compatibility — zero friction for existing users

- **No `PersistedState` shape change → no `SCHEMA_VERSION` bump, no migration step, no `partialize`/`validatePersistedState` change** (INV-6 confirmed field-by-field). The localStorage key is unchanged.
- An existing user with N months of history loses nothing at upgrade time: pruning only runs when a new month is generated, so history shrinks to the window at the next month boundary — the exact promised behavior, no upgrade-day surprise.
- Importing a backup with >3 months does **not** prune; the data stays browsable until the next generation tick. (If the imported active month is already expired, the import's own `checkDayTick` call generates + prunes immediately — acceptable and now explicit + tested, not accidental.)
- Legacy 10-day fortnights stay navigable within the window (INV-4).
- INV-7 rehydration guard untouched: `initApp` early-returns on `rehydrationError` before any tick, so auto-generation can never clobber unreadable-but-recoverable stored bytes. Generation lives only inside `checkDayTick`/`initApp` — never in a component mount effect.
- INV-9 read-only derivation untouched; `DayColumn`'s `fn?.id` effect already covers the fortnight switching automatically under an open compose form.
- The one-time prune is announced through the existing `announce()` live region (e.g. "Oldest month removed from history") — information, not interaction.
- Docs: delete the `FortnightSwitcher` row in `docs/TECH-DEBT.md`; this spec supersedes the amended spec's "Generate new month" paragraphs.

### 5. Test plan

Baseline 314 tests. Conventions per INV-10 (clock module mock, canonical `2026-08-18` Tuesday, mutable `clock.today` for day-advance, `seedApp()`, role/label queries).

**Deleted (~8):** regenerate dialog confirm/cancel + focus tests, button disabled/enabled pair, palette gating test ("excludes Generate new month until expired").

**Updated (~12):** `history.test.tsx` swaps `selectOptions` on the combobox for arrow clicks (read-only assertions, legacy-coexistence test kept and extended); `App.test.tsx` progress-indicator test keeps compiling because `regenerateFortnight` survives as an action; the 9 files using it as a read-only fixture are untouched.

**New (~17):**

- *Domain — `fortnight.test.ts` / `dates.test.ts` (TDD first):* retention keeps exactly current+2 by calendar month; dropped months take their todos/notes with them; retained data byte-identical; two legacy periods in one month both survive; a legacy period in month−3 drops; no-op at ≤3 months; never drops the active fortnight; `firstOfPrevMonth` cases if added.
- *Store — `dayTick.test.ts`:* first tick after month end auto-generates + carries pending todos/unresolved blockers, leaves `done`/resolved behind; generating tick stamps `lastRolloverDay` and a same-day second tick moves nothing (the INV-5 hazard); generates even when `lastRolloverDay === today` if active is expired (imported-backup case); Aug→Nov jump produces only November, history = real months; pruning the viewed month re-points view instead of blanking; import with >3 months does not prune (and the expired-import immediate-generation case is pinned).
- *Component — `history.test.tsx`:* arrows step one month, disable at both bounds; returning to current month selects today (`2026-08-18`), not day 1; past month shows read-only banner and hides compose UI; navigation clears an open compose form; legacy 10-day period reachable via `‹`; only retained months reachable.
- *App/commands:* "Generate new month" button and palette action are gone; expired banner cannot render.

`npm run verify` green is the definition of done.

### 6. Risks and viability

**Viable, controlled risk.** No schema change; the domain→store→component architecture absorbs each piece in its natural layer.

| Risk | Mitigation |
|---|---|
| Permanent data loss by design (prune) | Prune only at generation; never on import/rehydrate/migrate; announced via live region; manual Export remains |
| Latch blocks generation forever (no manual button left) | Expiry checked before latch + dedicated test; `regenerateFortnight` retained as internal safety valve |
| Same-day double migration (INV-5) | Generation stamps `lastRolloverDay` in the same `set()`; disjoint branches; dedicated test |
| Blank app after pruning the viewed month | View re-pointed in the same `set()`; dedicated test |
| Legacy fortnights vs. month-counted window | Retention keyed by calendar month; dedicated tests |

Estimated footprint: ~10 source files touched, 2 components deleted (`FortnightSwitcher`, `ConfirmDialog`), 1 added (`FortnightNav`), suite lands around 320–325 tests.

## Approved decisions log

- Silent prune, no auto-backup before pruning (user-approved; Export button remains the backup path).
- Gap months skipped — direct jump, no ghost months (user-approved).
- Navigation mock option A — `‹ Month YYYY ›` stepper in the dropdown's header slot (user-approved via visual companion).
- Approach 1 — generation + prune inside `checkDayTick` (user-approved).
- Zero-friction constraint: no schema bump, no upgrade-day pruning, no regressions for existing users (user requirement).
