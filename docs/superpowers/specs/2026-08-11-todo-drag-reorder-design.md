# Todo Drag & Drop Reorder (Priority Bands) — Design Spec

Amends [`2026-08-10-agile-todo-app-design.md`](2026-08-10-agile-todo-app-design.md) (which defined the day column's automatic todo ordering this spec makes user-controllable) and [`2026-08-11-three-month-window-auto-rollover-design.md`](2026-08-11-three-month-window-auto-rollover-design.md) (whose rollover/carry-over behavior gains an explicit ordering policy). Board layout, retention, and completion behavior are unchanged.

## Scope

Within the visible day column, pending todos can be **reordered by dragging** — and dragging a todo into another priority band **changes its priority**:

1. Each pending todo card grows a **drag handle**. Dragging with mouse **or touch** moves the card; a drop indicator shows the target slot.
2. The day's pending todos form three contiguous **priority bands** (High → Medium → Low, today's grouping). Dropping inside your own band reorders; dropping in another band re-prioritizes *and* places the todo at that position. While a drag is active, subtle band separators make the boundaries visible; they disappear on drop.
3. The same handle is **keyboard-operable**: grab, move slot by slot (crossing a band boundary changes priority), drop, or cancel — every move announced to the live region.
4. The manual order **persists** and survives rollover/carry-over per the policy in §2.
5. The Help modal documents the feature (Guide tab) and the keyboard pattern (Shortcuts tab).

Out of scope (deliberate YAGNI): dragging across days (rescheduling stays in the edit form; dropping onto the month tape is a possible future amendment), reordering `done` todos (they stay pinned after pending ones, auto-sorted), reordering notes, reordering checklist items, drag auto-scroll, and any new runtime dependency — the drag machinery is hand-rolled pointer events.

## 1. Data model

`Todo` gains one optional field in `src/domain/types.ts`:

```ts
sortIndex?: number; // position within its band; absent = never manually ordered
```

**No schema bump, no migration.** Same documented precedent as `checklist` and `Note.rolledOver`: an optional nested field on a value inside `todos` leaves every stored v3 blob structurally valid; `validatePersistedState` never descends into todo fields; `partialize`/INV-6 govern only top-level `PersistedState` keys. The field carries a comment in `types.ts` recording this reasoning.

**Ordering rule** (replaces the `createdAt` tie-break in `selectTodosForDay`):

> pending before done → priority band (high → medium → low) → `sortIndex` ascending (absent sorts last) → `createdAt`.

A **band** is the set of pending todos sharing (`fortnightId`, `scheduledDay`, `priority`). Untouched data renders exactly as today: no todo has a `sortIndex` until the user first drops one, so the `createdAt` tie-break keeps ruling.

## 2. Domain: `src/domain/reorder.ts`

A new pure module (imports only `./types` — INV-3). Functions take and return plain data, never mutate, never read time.

- `normalizeBand(todos, fortnightId, day, priority)` — rewrites the band's `sortIndex`es to contiguous integers `0..n-1` in current display order (`sortIndex ?? ∞`, then `createdAt`). Every band-touching operation runs this first, which is what makes "absent index" data safe to mix with indexed data. Bands are small (a day's todos of one priority), so contiguous re-indexing beats fractional indexing on simplicity.
- `reorderTodo(todos, id, targetPriority, targetIndex)` — the one user-facing operation. No-op for unknown ids and `done` todos. Normalizes the source and target bands, removes the todo from its band, clamps `targetIndex` to `[0, targetBand.length]`, inserts, re-indexes the target band, and writes `priority` when the band changed. Returns the new `todos` record.
- `appendToBand(todos, ids, ...)` (exact signature left to the plan) — the rollover/carry-over helper: normalizes the destination band, then appends the given todos after its last index, **preserving the relative order of the appended todos** (their old `sortIndex ?? ∞`, then `createdAt`; when a multi-day catch-up moves several days at once, earlier source days append first).

**Rollover/carry-over policy (the user-decided rule):** what you already arranged on the destination day keeps its curated order untouched; incoming todos queue *behind* in their band, keeping the relative order you had given them. `applyRollover` and `carryOverTodos` both apply it via `appendToBand`. INV-5's discipline is untouched: rollover still writes `scheduledDay` + `rolledOver` + (now) `sortIndex` and **never** `fortnightId`; carry-over still always writes `fortnightId`; `done` todos remain excluded from both; `lastRolloverDay` latching is unchanged. `rollover.ts` and `fortnight.ts` importing `./reorder` is sibling-only, so INV-3 holds.

## 3. Store: `src/store/store.ts`

One new action:

- `reorderTodo(id, targetPriority, targetIndex)` — thin `set()` wrapper over the domain function, plus an `announcement`: `Moved "<title>" to <Priority>, position <i> of <n>`. **The action itself refuses when `viewedFortnightId !== activeFortnightId`** — the INV-9 §2 pattern: reducer-level refusal is the one guard no keyboard path or future palette command can route around. (The UI additionally never renders handles in read-only mode, per INV-9 §1.)

No changes to `partialize`, migrations, `importState`, or `validatePersistedState`.

## 4. UI: pointer-event drag

**Handle.** `TodoItem` renders a drag handle `<button>` in the card's title row, only when `!readOnly && !todo.done` (INV-9 §1: the mutating element itself is gated). Accessible name `Reorder todo: <title>`; the visible glyph is decorative. The handle sets `touch-action: none` so pointer events fire on touch screens.

**Hook.** New `src/hooks/useDragReorder.ts` (imports store + react — layer arrows hold), instantiated once in `DayColumn` and passed down as per-item handle props. Pointer flow: `pointerdown` on the handle → `setPointerCapture` → `pointermove` computes the target slot by comparing pointer Y against the pending items' rect midpoints (rects re-read per move; the list is small) → `pointerup` commits via the store action → `pointercancel` aborts. Dragging never mutates state until the drop: the card follows visually (CSS transform + elevation) and a drop-indicator line marks the target slot, both styled with `tokens.css` custom properties (INV-12); the todo list itself re-renders only on commit.

**Bands.** While a drag is active, `DayColumn` renders the three band separators (High / Medium / Low, `aria-hidden` — they are pointer-targeting aids; the announcement carries the same information accessibly) between the pending todos, including for empty bands, so every priority is a visible drop target. The slot + band under the pointer determine `(targetPriority, targetIndex)` unambiguously. Done todos render below as today and are never drop targets.

**Keyboard.** On the focused handle: `Space`/`Enter` grabs (`aria-pressed="true"`, snapshot of the original `(priority, index)` taken); `↑`/`↓` move one slot per press, committing through the same store action each time — crossing a band boundary changes priority, exactly like the pointer path; `Space`/`Enter` drops (clears the snapshot); `Escape` cancels by reordering back to the snapshot. Every move reuses the action's announcement; grab/drop/cancel get their own (`Grabbed "<title>" — use arrow keys to move, Space to drop, Escape to cancel`, etc.). `↑`/`↓` are free: the global `useShortcuts` listener only claims `←`/`→`/`Home`/`End`, and it bails on none of this because these handlers live on the handle itself. No `useShortcuts` change.

**View changes reset drag.** Switching day or fortnight mid-drag (or mid-grab) cancels the drag without committing — a new effect in the hook keyed on `fn?.id` *and* `selectedDay`, separate from (and analogous to) `DayColumn`'s existing `fn?.id`-keyed `composeIntent` reset, which stays as it is.

## 5. Help modal

- **Guide tab**, new entry after "Todos & priorities": *"Reorder & re-prioritize — Drag a todo by its handle to reorder it within its priority group, or drop it in another group to change its priority. Incomplete todos that roll over to today line up after the ones you already arranged."*
- **Shortcuts tab**, new rows for the handle keys: grab/drop (`Space`), move (`↑`/`↓`), cancel (`Esc`) — labeled as acting on a focused todo handle, to distinguish them from the global shortcuts.

## 6. Testing

Per INV-10 (mocked `./clock`, `2026-08-18` fixtures, role/label queries, colocated grouped files):

- **`src/domain/reorder.test.ts`** (new) — reorder within a band; cross-band move writes `priority` and re-indexes both bands; clamping at both ends; no-op for `done` and unknown ids; `normalizeBand` materializes indices for legacy (index-less) todos in `createdAt` order; `appendToBand` preserves relative order and appends after existing members, including when the destination band is legacy/index-less.
- **`src/domain/rollover.test.ts` / `carryOver.test.ts`** — rolled/carried todos land at the end of their destination band in preserved relative order; the destination day's curated order is untouched; multi-day catch-up appends earlier days first; `fortnightId` write discipline unchanged (INV-5).
- **`src/store/store.test.ts`** — the action wires domain → state; announcement text; **refusal while viewing a read-only fortnight** (INV-9); no-op on done todos.
- **`src/store/storePersistence.test.ts`** — `sortIndex` survives an export → import round trip.
- **`src/components/todos/todos.test.tsx` / `board.test.tsx`** — handle absent on done cards and in read-only history; pointer sequence (`pointerdown`/`pointermove`/`pointerup` with mocked `getBoundingClientRect`) reorders and re-prioritizes; band separators appear only during drag; keyboard flow: grab → arrows (including a boundary crossing that changes priority) → drop, and Escape restoring the snapshot; announcements asserted via the live region.
- **`src/components/help/help.test.tsx`** — Guide entry and Shortcuts rows present.

## 7. Documentation updates

- **README**: add drag & drop reordering to the feature list and the keyboard table.
- **CLAUDE.md**: one sentence in the keyboard-model paragraph (handle-local keys, and that they coexist with the global listener by living on the element), and update the ordering rule wherever `selectTodosForDay`'s sort is described.
- **`enhancements.md`**: mark the line shipped once merged.

## 8. What didn't change

`SCHEMA_VERSION` (still 3), migrations, `partialize`, `validatePersistedState`, `PersistedState`'s 7 fields, `TodoForm`, notes ordering, `selectDayWorkload` (the tape's workload summary doesn't expose within-band order), the global shortcut set in `useShortcuts`, `data-*` public API (any new styling hooks are module-CSS classes, not new `data-*` vocabulary), the command palette, and the 3-package dependency set.
