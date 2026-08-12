# Todo Drag & Drop Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pending todos in the day column can be reordered by dragging (mouse/touch) or keyboard within priority bands; dropping in another band re-prioritizes; the manual order persists and survives rollover/carry-over.

**Architecture:** A pure domain module (`src/domain/reorder.ts`) owns band normalization, reordering, and the rollover append policy over a new optional `Todo.sortIndex` field (no schema bump — the documented `checklist` precedent). One store action (`reorderTodo`) wires it in with an INV-9-style reducer guard. A hand-rolled pointer-events hook (`src/hooks/useDragReorder.ts`) plus a keyboard grab pattern on a per-card handle drive the UI.

**Tech Stack:** React 19 + TypeScript strict + Zustand 5 + Vitest 4 + RTL + CSS Modules. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-11-todo-drag-reorder-design.md` — read it before starting any task.

## Global Constraints

- `npm run verify` (typecheck + 390-and-growing tests) green after every task. **Never** `npx tsc --noEmit` (checks zero files) — always `npm run typecheck`.
- No new runtime dependencies (the set is exactly `react`, `react-dom`, `zustand`).
- INV-1/INV-2: no ambient time, no UTC date slicing. Domain functions take data as parameters.
- INV-3: `src/domain/reorder.ts` imports only sibling modules (`./types`).
- INV-5: `applyRollover` never writes `fortnightId`; `carryOverTodos` always writes it; `done` todos excluded from both.
- INV-10: no vitest imports (globals), clock mocked via the module (never `vi.setSystemTime`), fixture date `2026-08-18` (Tuesday), role/label queries, tests colocated in the existing per-feature files.
- INV-12: all colors/spacing/shadows from `tokens.css` custom properties; one colocated module CSS per component; no `composes:`/`:global`.
- INV-13: no new `data-*` attributes — new styling hooks are module-CSS classes.
- User-visible copy says "month"/"group"; code identifiers keep `fortnight`/`priority` names.
- Commit after every task; **do not push** (pushes to main deploy).

---

### Task 1: Domain module `src/domain/reorder.ts` + `sortIndex` field

**Files:**
- Modify: `src/domain/types.ts` (add `sortIndex` to `Todo`)
- Create: `src/domain/reorder.ts`
- Test: `src/domain/reorder.test.ts` (new)

**Interfaces:**
- Consumes: `Todo`, `Priority`, `ISODate` from `./types`.
- Produces (later tasks rely on these exact signatures):
  - `normalizeBand(todos: Record<string, Todo>, fortnightId: string, day: ISODate, priority: Priority): Record<string, Todo>`
  - `reorderTodo(todos: Record<string, Todo>, id: string, targetPriority: Priority, targetIndex: number): Record<string, Todo>`
  - `appendToDay(todos: Record<string, Todo>, movedIds: string[], fortnightId: string, day: ISODate): Record<string, Todo>`
  - `movedOrder(a: Todo, b: Todo): number` (comparator)
  - `bandPosition(todos: Record<string, Todo>, id: string): { priority: Priority; index: number; size: number } | null`
  - `moveTarget(todos: Record<string, Todo>, id: string, direction: -1 | 1): { priority: Priority; index: number } | null`

- [ ] **Step 1: Add the field to `Todo` in `src/domain/types.ts`**

After the `checklist?: ChecklistItem[];` line (keep its comment intact), add:

```ts
  // Optional: position within its priority band (same fortnightId +
  // scheduledDay + priority, pending only). Absent = never manually
  // ordered -- sorts after indexed todos, createdAt tie-break. Same
  // no-schema-bump precedent as `checklist` above: validatePersistedState
  // never inspects todo internals.
  sortIndex?: number;
```

- [ ] **Step 2: Write the failing tests**

Create `src/domain/reorder.test.ts`. No vitest imports (globals). Build fixtures inline — domain tests never touch the store:

```ts
import type { Todo } from './types';
import {
  appendToDay, bandPosition, movedOrder, moveTarget, normalizeBand, reorderTodo,
} from './reorder';

const FN = 'fn-1';
const DAY = '2026-08-18';

let seq = 0;
function mkTodo(partial: Partial<Todo> & { id: string }): Todo {
  seq += 1;
  return {
    fortnightId: FN, title: partial.id, priority: 'medium', scheduledDay: DAY,
    done: false, createdAt: `2026-08-10T00:00:${String(seq).padStart(2, '0')}.000Z`,
    rolledOver: false, ...partial,
  };
}

function record(...todos: Todo[]): Record<string, Todo> {
  return Object.fromEntries(todos.map((t) => [t.id, t]));
}

function bandTitles(todos: Record<string, Todo>, priority: Todo['priority']): string[] {
  return Object.values(todos)
    .filter((t) => t.priority === priority && !t.done && t.scheduledDay === DAY)
    .sort((a, b) =>
      (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER)
      || a.createdAt.localeCompare(b.createdAt))
    .map((t) => t.id);
}

describe('normalizeBand', () => {
  it('materializes contiguous indices for legacy (index-less) todos in createdAt order', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }), mkTodo({ id: 'c' }));
    const out = normalizeBand(todos, FN, DAY, 'medium');
    expect(out['a'].sortIndex).toBe(0);
    expect(out['b'].sortIndex).toBe(1);
    expect(out['c'].sortIndex).toBe(2);
  });

  it('returns the input record unchanged when indices are already contiguous', () => {
    const todos = record(mkTodo({ id: 'a', sortIndex: 0 }), mkTodo({ id: 'b', sortIndex: 1 }));
    expect(normalizeBand(todos, FN, DAY, 'medium')).toBe(todos);
  });

  it('ignores done todos and other days/priorities/fortnights', () => {
    const todos = record(
      mkTodo({ id: 'a' }),
      mkTodo({ id: 'done', done: true }),
      mkTodo({ id: 'other-day', scheduledDay: '2026-08-19' }),
      mkTodo({ id: 'other-prio', priority: 'high' }),
      mkTodo({ id: 'other-fn', fortnightId: 'fn-2' }),
    );
    const out = normalizeBand(todos, FN, DAY, 'medium');
    expect(out['a'].sortIndex).toBe(0);
    for (const id of ['done', 'other-day', 'other-prio', 'other-fn']) {
      expect(out[id].sortIndex).toBeUndefined();
    }
  });
});

describe('reorderTodo', () => {
  it('reorders within a band', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }), mkTodo({ id: 'c' }));
    const out = reorderTodo(todos, 'c', 'medium', 0);
    expect(bandTitles(out, 'medium')).toEqual(['c', 'a', 'b']);
  });

  it('cross-band move writes priority and re-indexes both bands contiguously', () => {
    const todos = record(
      mkTodo({ id: 'h1', priority: 'high' }), mkTodo({ id: 'h2', priority: 'high' }),
      mkTodo({ id: 'm1' }), mkTodo({ id: 'm2' }),
    );
    const out = reorderTodo(todos, 'h1', 'medium', 1);
    expect(out['h1'].priority).toBe('medium');
    expect(bandTitles(out, 'medium')).toEqual(['m1', 'h1', 'm2']);
    expect(bandTitles(out, 'high')).toEqual(['h2']);
    expect(out['h2'].sortIndex).toBe(0); // source band re-indexed
    expect(out['m2'].sortIndex).toBe(2);
  });

  it('clamps the target index at both ends', () => {
    const todos = record(mkTodo({ id: 'a' }), mkTodo({ id: 'b' }));
    expect(bandTitles(reorderTodo(todos, 'a', 'medium', 99), 'medium')).toEqual(['b', 'a']);
    expect(bandTitles(reorderTodo(todos, 'b', 'medium', -5), 'medium')).toEqual(['b', 'a']);
  });

  it('is a no-op for done and unknown ids', () => {
    const todos = record(mkTodo({ id: 'a', done: true }), mkTodo({ id: 'b' }));
    expect(reorderTodo(todos, 'a', 'high', 0)).toBe(todos);
    expect(reorderTodo(todos, 'ghost', 'high', 0)).toBe(todos);
  });

  it('mixes legacy index-less todos safely (normalizes before inserting)', () => {
    const todos = record(mkTodo({ id: 'old1' }), mkTodo({ id: 'old2' }), mkTodo({ id: 'old3' }));
    const out = reorderTodo(todos, 'old3', 'medium', 1);
    expect(bandTitles(out, 'medium')).toEqual(['old1', 'old3', 'old2']);
    expect(out['old1'].sortIndex).toBe(0);
    expect(out['old2'].sortIndex).toBe(2);
  });
});

describe('appendToDay', () => {
  it('appends moved todos after existing band members, preserving given order', () => {
    const todos = record(
      mkTodo({ id: 'm1', sortIndex: 0 }), mkTodo({ id: 'm2', sortIndex: 1 }),
      mkTodo({ id: 'in1' }), mkTodo({ id: 'in2' }),
    );
    const out = appendToDay(todos, ['in2', 'in1'], FN, DAY);
    expect(bandTitles(out, 'medium')).toEqual(['m1', 'm2', 'in2', 'in1']);
    expect(out['in2'].sortIndex).toBe(2);
    expect(out['in1'].sortIndex).toBe(3);
  });

  it('groups moved todos into their own priority bands', () => {
    const todos = record(
      mkTodo({ id: 'h-here', priority: 'high', sortIndex: 0 }),
      mkTodo({ id: 'h-in', priority: 'high' }),
      mkTodo({ id: 'l-in', priority: 'low' }),
    );
    const out = appendToDay(todos, ['h-in', 'l-in'], FN, DAY);
    expect(bandTitles(out, 'high')).toEqual(['h-here', 'h-in']);
    expect(out['l-in'].sortIndex).toBe(0); // alone in its (previously empty) band
  });

  it('normalizes a legacy index-less destination band before appending (incoming stays behind)', () => {
    const todos = record(mkTodo({ id: 'legacy1' }), mkTodo({ id: 'legacy2' }), mkTodo({ id: 'in' }));
    const out = appendToDay(todos, ['in'], FN, DAY);
    expect(bandTitles(out, 'medium')).toEqual(['legacy1', 'legacy2', 'in']);
    expect(out['legacy1'].sortIndex).toBe(0);
    expect(out['in'].sortIndex).toBe(2);
  });
});

describe('movedOrder', () => {
  it('sorts by source day, then sortIndex (absent last), then createdAt', () => {
    const a = mkTodo({ id: 'a', scheduledDay: '2026-08-14', sortIndex: 1 });
    const b = mkTodo({ id: 'b', scheduledDay: '2026-08-17', sortIndex: 0 });
    const c = mkTodo({ id: 'c', scheduledDay: '2026-08-17' });
    const d = mkTodo({ id: 'd', scheduledDay: '2026-08-17', sortIndex: 2 });
    expect([d, c, b, a].sort(movedOrder).map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('bandPosition / moveTarget', () => {
  const todos = record(
    mkTodo({ id: 'h1', priority: 'high', sortIndex: 0 }),
    mkTodo({ id: 'm1', sortIndex: 0 }), mkTodo({ id: 'm2', sortIndex: 1 }),
    mkTodo({ id: 'done-l', priority: 'low', done: true }),
  );

  it('bandPosition reports index and band size; null for done/unknown', () => {
    expect(bandPosition(todos, 'm2')).toEqual({ priority: 'medium', index: 1, size: 2 });
    expect(bandPosition(todos, 'done-l')).toBeNull();
    expect(bandPosition(todos, 'ghost')).toBeNull();
  });

  it('moveTarget steps within the band', () => {
    expect(moveTarget(todos, 'm2', -1)).toEqual({ priority: 'medium', index: 0 });
    expect(moveTarget(todos, 'm1', 1)).toEqual({ priority: 'medium', index: 1 });
  });

  it('moveTarget crosses band boundaries (up: end of previous; down: start of next)', () => {
    expect(moveTarget(todos, 'm1', -1)).toEqual({ priority: 'high', index: 1 });
    expect(moveTarget(todos, 'm2', 1)).toEqual({ priority: 'low', index: 0 });
    expect(moveTarget(todos, 'h1', 1)).toEqual({ priority: 'medium', index: 0 });
  });

  it('moveTarget is null at the very top and bottom (low band is empty of pending)', () => {
    expect(moveTarget(todos, 'h1', -1)).toBeNull();
    const atBottom = record(mkTodo({ id: 'l1', priority: 'low', sortIndex: 0 }));
    expect(moveTarget(atBottom, 'l1', 1)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/domain/reorder.test.ts`
Expected: FAIL — `Cannot find module './reorder'` (or equivalent).

- [ ] **Step 4: Implement `src/domain/reorder.ts`**

```ts
import type { ISODate, Priority, Todo } from './types';

/** Absent sortIndex sorts last — the selector and every band operation
 *  share this rule, which is what lets legacy (never-reordered) data mix
 *  safely with indexed data. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

/** A band = the PENDING todos sharing (fortnightId, scheduledDay, priority),
 *  in display order. Done todos are never part of any band. */
function bandMembers(
  todos: Record<string, Todo>,
  fortnightId: string,
  day: ISODate,
  priority: Priority,
): Todo[] {
  return Object.values(todos)
    .filter((t) =>
      t.fortnightId === fortnightId && t.scheduledDay === day
      && t.priority === priority && !t.done)
    .sort((a, b) =>
      (a.sortIndex ?? UNRANKED) - (b.sortIndex ?? UNRANKED)
      || a.createdAt.localeCompare(b.createdAt));
}

/** Rewrites a band's sortIndexes to contiguous 0..n-1 in current display
 *  order. Every band-touching operation runs this first. Returns the input
 *  record untouched when nothing needs rewriting. */
export function normalizeBand(
  todos: Record<string, Todo>,
  fortnightId: string,
  day: ISODate,
  priority: Priority,
): Record<string, Todo> {
  const members = bandMembers(todos, fortnightId, day, priority);
  if (members.every((t, i) => t.sortIndex === i)) return todos;
  const out = { ...todos };
  members.forEach((t, i) => { out[t.id] = { ...t, sortIndex: i }; });
  return out;
}

/** The one user-facing operation (spec §2): move a pending todo to
 *  (targetPriority, targetIndex) within its own day. Clamps the index,
 *  writes `priority` on a band change, re-indexes both bands. No-op for
 *  done/unknown ids. */
export function reorderTodo(
  todos: Record<string, Todo>,
  id: string,
  targetPriority: Priority,
  targetIndex: number,
): Record<string, Todo> {
  const todo = todos[id];
  if (!todo || todo.done) return todos;
  let out = normalizeBand(todos, todo.fortnightId, todo.scheduledDay, todo.priority);
  if (todo.priority !== targetPriority) {
    out = normalizeBand(out, todo.fortnightId, todo.scheduledDay, targetPriority);
  }
  const band = bandMembers(out, todo.fortnightId, todo.scheduledDay, targetPriority)
    .filter((t) => t.id !== id);
  const clamped = Math.max(0, Math.min(targetIndex, band.length));
  band.splice(clamped, 0, out[id]);
  out = { ...out };
  band.forEach((t, i) => { out[t.id] = { ...t, priority: targetPriority, sortIndex: i }; });
  if (todo.priority !== targetPriority) {
    out = normalizeBand(out, todo.fortnightId, todo.scheduledDay, todo.priority);
  }
  return out;
}

/** Relative-order comparator for todos being moved by rollover/carry-over:
 *  earlier source day first, then manual order, then age. Compare on the
 *  ORIGINAL todos (before relocation). */
export function movedOrder(a: Todo, b: Todo): number {
  return a.scheduledDay.localeCompare(b.scheduledDay)
    || (a.sortIndex ?? UNRANKED) - (b.sortIndex ?? UNRANKED)
    || a.createdAt.localeCompare(b.createdAt);
}

/** Rollover/carry-over ordering policy (spec §2): `movedIds` — already
 *  relocated onto `day`, already in desired relative order (sort by
 *  `movedOrder` before relocating) — are appended AFTER each destination
 *  band's existing members, whose curated order is normalized but otherwise
 *  untouched. */
export function appendToDay(
  todos: Record<string, Todo>,
  movedIds: string[],
  fortnightId: string,
  day: ISODate,
): Record<string, Todo> {
  const movedSet = new Set(movedIds);
  const out = { ...todos };
  for (const priority of PRIORITIES) {
    const moved = movedIds.map((id) => out[id]).filter((t) => t.priority === priority);
    if (moved.length === 0) continue;
    const existing = bandMembers(out, fortnightId, day, priority)
      .filter((t) => !movedSet.has(t.id));
    existing.forEach((t, i) => { out[t.id] = { ...t, sortIndex: i }; });
    moved.forEach((t, i) => { out[t.id] = { ...t, sortIndex: existing.length + i }; });
  }
  return out;
}

export interface BandPosition { priority: Priority; index: number; size: number }

/** Where a pending todo currently sits in its band. Null for done/unknown. */
export function bandPosition(todos: Record<string, Todo>, id: string): BandPosition | null {
  const todo = todos[id];
  if (!todo || todo.done) return null;
  const band = bandMembers(todos, todo.fortnightId, todo.scheduledDay, todo.priority);
  return { priority: todo.priority, index: band.findIndex((t) => t.id === id), size: band.length };
}

/** Where one keyboard step lands (-1 = up, +1 = down): the neighbouring
 *  slot in the same band, or across the boundary into the adjacent
 *  priority (up: end of the previous band; down: start of the next).
 *  Null at the very top/bottom and for done/unknown ids. */
export function moveTarget(
  todos: Record<string, Todo>,
  id: string,
  direction: -1 | 1,
): { priority: Priority; index: number } | null {
  const pos = bandPosition(todos, id);
  if (!pos) return null;
  const next = pos.index + direction;
  if (next >= 0 && next < pos.size) return { priority: pos.priority, index: next };
  const bandIdx = PRIORITIES.indexOf(pos.priority) + direction;
  if (bandIdx < 0 || bandIdx >= PRIORITIES.length) return null;
  const targetPriority = PRIORITIES[bandIdx];
  if (direction === 1) return { priority: targetPriority, index: 0 };
  const todo = todos[id];
  const size = bandMembers(todos, todo.fortnightId, todo.scheduledDay, targetPriority).length;
  return { priority: targetPriority, index: size };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/domain/reorder.test.ts`
Expected: PASS (all describes).

- [ ] **Step 6: Full gate + commit**

Run: `npm run verify` — must be green (nothing existing consumed `sortIndex` yet).

```bash
git add src/domain/types.ts src/domain/reorder.ts src/domain/reorder.test.ts
git commit -m "feat(domain): add sortIndex band reordering module"
```

---

### Task 2: Selector ordering rule

**Files:**
- Modify: `src/store/selectors.ts:14-22` (`selectTodosForDay`)
- Test: `src/store/selectors.test.ts`

**Interfaces:**
- Consumes: `Todo.sortIndex` (Task 1).
- Produces: `selectTodosForDay` now sorts pending-first → priority band → `sortIndex` ascending (absent last) → `createdAt`. Signature unchanged. `selectDayWorkload` is deliberately untouched (spec §8).

- [ ] **Step 1: Write the failing test**

Add to the `describe('selectors', ...)` block in `src/store/selectors.test.ts` (fixtures via store actions + `setState` patch, matching the file's existing style):

```ts
  it('selectTodosForDay respects sortIndex within a band, absent-index todos last', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'first-created', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'second-created', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'legacy', priority: 'medium', scheduledDay: '2026-08-18' });
    const byTitle = (title: string) =>
      Object.values(useAppStore.getState().todos).find((t) => t.title === title)!;
    useAppStore.setState((prev) => ({
      todos: {
        ...prev.todos,
        [byTitle('second-created').id]: { ...byTitle('second-created'), sortIndex: 0 },
        [byTitle('first-created').id]: { ...byTitle('first-created'), sortIndex: 1 },
        // 'legacy' keeps no sortIndex — must sort last despite earliest creation
      },
    }));

    const s = useAppStore.getState();
    const fn = selectViewedFortnight(s)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['second-created', 'first-created', 'legacy']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/selectors.test.ts`
Expected: FAIL — order comes out `['first-created', 'second-created', 'legacy']` (createdAt rules today).

- [ ] **Step 3: Implement**

In `src/store/selectors.ts`, replace the sort in `selectTodosForDay` with:

```ts
    .sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.sortIndex ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt),
    );
```

- [ ] **Step 4: Run tests, then full gate**

Run: `npx vitest run src/store/selectors.test.ts` → PASS. Then `npm run verify` → green.

- [ ] **Step 5: Commit**

```bash
git add src/store/selectors.ts src/store/selectors.test.ts
git commit -m "feat(store): order day todos by sortIndex within priority bands"
```

---

### Task 3: Rollover & carry-over append policy

**Files:**
- Modify: `src/domain/rollover.ts` (`applyRollover` only — `applyNoteRollover` untouched)
- Modify: `src/domain/fortnight.ts` (`carryOverTodos` only — notes/adapt/prune untouched)
- Test: `src/domain/rollover.test.ts`, `src/domain/carryOver.test.ts`

**Interfaces:**
- Consumes: `appendToDay`, `movedOrder` from `./reorder` (Task 1).
- Produces: `applyRollover` / `carryOverTodos` signatures unchanged; moved pending todos now land at the end of their destination band in `movedOrder`, destination's curated order untouched. `adaptFortnightToMonth` is deliberately untouched (it reshapes pre-v3 data, which can carry no `sortIndex`).

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/rollover.test.ts`, matching that file's existing fixture helpers (read the file first; adapt `mkTodo`/fortnight fixture names to what exists — the assertions below are the contract):

```ts
  describe('rollover ordering policy (spec 2026-08-11 drag-reorder §2)', () => {
    // Fortnight fixture anchored 2026-08-17; today = 2026-08-18.
    it('appends rolled todos after the destination band, preserving their relative order', () => {
      const todos = {
        here: mk('here', { scheduledDay: '2026-08-18', priority: 'medium', sortIndex: 0 }),
        oldB: mk('oldB', { scheduledDay: '2026-08-17', priority: 'medium', sortIndex: 1 }),
        oldA: mk('oldA', { scheduledDay: '2026-08-17', priority: 'medium', sortIndex: 0 }),
      };
      const { todos: out } = applyRollover(todos, fortnight, '2026-08-18');
      expect(out['here'].sortIndex).toBe(0);   // curated order untouched
      expect(out['oldA'].sortIndex).toBe(1);   // preserved relative order…
      expect(out['oldB'].sortIndex).toBe(2);   // …behind the existing member
      expect(out['oldA'].scheduledDay).toBe('2026-08-18');
      expect(out['oldA'].rolledOver).toBe(true);
    });

    it('multi-day catch-up appends earlier source days first', () => {
      const todos = {
        mon: mk('mon', { scheduledDay: '2026-08-17', priority: 'high' }),
        fri: mk('fri', { scheduledDay: '2026-08-14', priority: 'high' }),
      };
      const { todos: out } = applyRollover(todos, fortnight, '2026-08-18');
      expect(out['fri'].sortIndex).toBe(0);
      expect(out['mon'].sortIndex).toBe(1);
    });

    it('never writes fortnightId (INV-5)', () => {
      const todos = { old: mk('old', { scheduledDay: '2026-08-17' }) };
      const { todos: out } = applyRollover(todos, fortnight, '2026-08-18');
      expect(out['old'].fortnightId).toBe(todos['old'].fortnightId);
    });
  });
```

Add to `src/domain/carryOver.test.ts` (same read-the-file-first rule):

```ts
  describe('carry-over ordering policy (spec 2026-08-11 drag-reorder §2)', () => {
    it('relocated todos queue behind what already sits on the target day, relative order kept', () => {
      // oldFortnight ended; newFortnight anchored so effectiveBoardDay = today.
      // 'planned' already lives on the target day inside the NEW fortnight window
      // (the carried-with-unchanged-day branch); 'x2'/'x1' fall outside and relocate.
      const todos = {
        planned: mk('planned', { scheduledDay: today, priority: 'low', sortIndex: 0 }),
        x2: mk('x2', { scheduledDay: pastDay, priority: 'low', sortIndex: 1 }),
        x1: mk('x1', { scheduledDay: pastDay, priority: 'low', sortIndex: 0 }),
      };
      const out = carryOverTodos(todos, oldFortnightId, newFortnight, today);
      expect(out['planned'].sortIndex).toBe(0);
      expect(out['x1'].sortIndex).toBe(1);
      expect(out['x2'].sortIndex).toBe(2);
      expect(out['x1'].fortnightId).toBe(newFortnight.id); // always rewritten (INV-5)
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/domain/rollover.test.ts src/domain/carryOver.test.ts`
Expected: new tests FAIL on `sortIndex` assertions (`undefined`); every pre-existing test still PASSES.

- [ ] **Step 3: Implement `applyRollover`**

Replace the body of `applyRollover` in `src/domain/rollover.ts` (add `import { appendToDay, movedOrder } from './reorder';` — sibling import, INV-3-clean):

```ts
export function applyRollover(
  todos: Record<string, Todo>,
  fortnight: Fortnight,
  today: ISODate,
): { todos: Record<string, Todo>; changed: boolean } {
  const target = effectiveBoardDay(fortnight, today);
  if (target === null) return { todos, changed: false };
  // Sorted BEFORE relocation: movedOrder keys on the original day/index.
  const moved = Object.values(todos)
    .filter((t) => t.fortnightId === fortnight.id && !t.done && t.scheduledDay < today)
    .sort(movedOrder);
  if (moved.length === 0) return { todos, changed: false };
  const out: Record<string, Todo> = { ...todos };
  for (const t of moved) out[t.id] = { ...t, scheduledDay: target, rolledOver: true };
  // Ordering policy (spec §2): what was already arranged on the target day
  // keeps its curated order; incoming todos queue behind, relative order kept.
  return { todos: appendToDay(out, moved.map((t) => t.id), fortnight.id, target), changed: true };
}
```

- [ ] **Step 4: Implement `carryOverTodos`**

Replace its body in `src/domain/fortnight.ts` (add `import { appendToDay, movedOrder } from './reorder';`):

```ts
export function carryOverTodos(
  todos: Record<string, Todo>,
  oldFortnightId: string,
  newFortnight: Fortnight,
  today: ISODate,
): Record<string, Todo> {
  const target = effectiveBoardDay(newFortnight, today);
  if (target === null) return todos; // unreachable: newFortnight is anchored to today
  const out: Record<string, Todo> = { ...todos };
  const relocated: Todo[] = []; // originals, for movedOrder's pre-relocation keys
  for (const t of Object.values(todos)) {
    if (t.fortnightId !== oldFortnightId || t.done) continue;
    if (newFortnight.days.includes(t.scheduledDay) && t.scheduledDay >= target) {
      out[t.id] = { ...t, fortnightId: newFortnight.id };
    } else {
      out[t.id] = {
        ...t,
        fortnightId: newFortnight.id,
        scheduledDay: target,
        rolledOver: t.scheduledDay < today ? true : t.rolledOver,
      };
      relocated.push(t);
    }
  }
  if (relocated.length === 0) return out;
  relocated.sort(movedOrder);
  // Same ordering policy as applyRollover (spec §2).
  return appendToDay(out, relocated.map((t) => t.id), newFortnight.id, target);
}
```

- [ ] **Step 5: Run tests, then full gate**

Run: `npx vitest run src/domain/` → PASS, including all pre-existing rollover/carry-over/dayTick cases. Then `npm run verify` → green (if `src/store/dayTick.test.ts` breaks, the implementation changed observable behavior beyond ordering — fix the implementation, not the test).

- [ ] **Step 6: Commit**

```bash
git add src/domain/rollover.ts src/domain/fortnight.ts src/domain/rollover.test.ts src/domain/carryOver.test.ts
git commit -m "feat(domain): rolled/carried todos queue behind the destination band"
```

---

### Task 4: Store action `reorderTodo`

**Files:**
- Modify: `src/store/store.ts` (AppState interface + one action)
- Test: `src/store/store.test.ts`, `src/store/storePersistence.test.ts`

**Interfaces:**
- Consumes: `reorderTodo`, `bandPosition` from `../domain/reorder` (Task 1).
- Produces: store action `reorderTodo(id: string, targetPriority: Priority, targetIndex: number): void` — refuses in read-only view (INV-9 §2), announces `Moved "<title>" to <Priority>, position <i> of <n>` (1-based). Tasks 5–6 call exactly this.

- [ ] **Step 1: Write the failing tests**

In `src/store/store.test.ts`, add a `describe('reorderTodo', ...)` (mirror the file's existing setup — clock mock `./clock`, reset via `setState` + `initApp`):

```ts
  describe('reorderTodo', () => {
    it('reorders and announces the new position (1-based)', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
      const b = Object.values(useAppStore.getState().todos).find((t) => t.title === 'B')!;
      useAppStore.getState().reorderTodo(b.id, 'medium', 0);
      expect(useAppStore.getState().todos[b.id].sortIndex).toBe(0);
      expect(useAppStore.getState().announcement).toBe('Moved "B" to Medium, position 1 of 2');
    });

    it('cross-band call re-prioritizes', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      const a = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().reorderTodo(a.id, 'high', 0);
      expect(useAppStore.getState().todos[a.id].priority).toBe('high');
    });

    it('refuses while viewing a read-only fortnight (INV-9)', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
      const b = Object.values(useAppStore.getState().todos).find((t) => t.title === 'B')!;
      useAppStore.setState({ viewedFortnightId: 'some-old-fortnight' });
      useAppStore.getState().reorderTodo(b.id, 'medium', 0);
      expect(useAppStore.getState().todos[b.id].sortIndex).toBeUndefined();
    });

    it('no-op on done todos', () => {
      const st = useAppStore.getState();
      st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
      const a = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().toggleDone(a.id);
      useAppStore.getState().reorderTodo(a.id, 'high', 0);
      expect(useAppStore.getState().todos[a.id].priority).toBe('medium');
    });
  });
```

In `src/store/storePersistence.test.ts`, add next to the existing checklist round-trip test (reuse its snapshot-building pattern — read that test first):

```ts
  it('round-trips todo.sortIndex through export -> import', () => {
    // Build a persisted snapshot whose single todo carries sortIndex: 3,
    // serialize with serializeState, parse with parseBackup, importState it,
    // then: expect(useAppStore.getState().todos['the-id'].sortIndex).toBe(3);
  });
```

(The comment block is the contract; write it as real code following the sibling test's fixture shape.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/store.test.ts src/store/storePersistence.test.ts`
Expected: new tests FAIL — `reorderTodo is not a function`; round-trip fails only if written against a store missing nothing (it should actually PASS already, since `todos` round-trips wholesale — keep it as a regression guard).

- [ ] **Step 3: Implement the action**

In `src/store/store.ts`:

1. Import: `import { bandPosition, reorderTodo as domainReorderTodo } from '../domain/reorder';`
2. In `AppState`, after `deleteTodo`: `reorderTodo: (id: string, targetPriority: Priority, targetIndex: number) => void;`
3. Implementation, after the `deleteTodo` action:

```ts
        // Refuses in the reducer, same INV-9 pattern as setComposeIntent:
        // the UI never renders drag handles in read-only mode, but this is
        // the guard a keyboard path can't route around.
        reorderTodo: (id, targetPriority, targetIndex) =>
          set((s) => {
            if (s.viewedFortnightId !== s.activeFortnightId) return {};
            const before = s.todos[id];
            if (!before || before.done) return {};
            const todos = domainReorderTodo(s.todos, id, targetPriority, targetIndex);
            if (todos === s.todos) return {};
            const pos = bandPosition(todos, id);
            if (!pos) return { todos };
            const label = targetPriority.charAt(0).toUpperCase() + targetPriority.slice(1);
            return {
              todos,
              announcement: `Moved "${before.title}" to ${label}, position ${pos.index + 1} of ${pos.size}`,
            };
          }),
```

- [ ] **Step 4: Run tests, then full gate**

Run: `npx vitest run src/store/` → PASS. Then `npm run verify` → green.

- [ ] **Step 5: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts src/store/storePersistence.test.ts
git commit -m "feat(store): reorderTodo action with read-only refusal and live announcement"
```

---

### Task 5: Pointer drag — hook, handle, band separators, drop indicator

**Files:**
- Create: `src/hooks/useDragReorder.ts`
- Modify: `src/components/todos/TodoItem.tsx`, `src/components/todos/TodoItem.module.css`
- Modify: `src/components/board/DayColumn.tsx`, `src/components/board/DayColumn.module.css`
- Test: `src/components/board/board.test.tsx`

**Interfaces:**
- Consumes: store action `reorderTodo` (Task 4), `bandPosition` (Task 1).
- Produces (Task 6 builds on these):
  - Hook: `useDragReorder(pendingTodos: Todo[], viewKey: string)` returning `{ dragId: string | null; dragOffset: number; target: { priority: Priority; index: number } | null; getHandleProps(todo: Todo): React.HTMLAttributes<HTMLButtonElement>; registerItem(id: string): (el: HTMLElement | null) => void; registerSeparator(p: Priority): (el: HTMLElement | null) => void }`
  - `TodoItem` new optional prop: `reorder?: { handleProps: React.HTMLAttributes<HTMLButtonElement>; itemRef: (el: HTMLElement | null) => void; dragging: boolean; dragOffset: number }` — handle button renders only when `!readOnly && !todo.done && reorder` and has accessible name `` `Reorder todo: ${todo.title}` ``.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/board/board.test.tsx` (it already mocks `../../store/clock` and seeds via `seedApp` — follow the file's conventions). jsdom has no layout, so rects are mocked per element; jsdom also lacks `setPointerCapture` (the hook must call it optionally):

```ts
import { fireEvent, render, screen, within } from '@testing-library/react';
// (merge with the file's existing imports)

function mockRects(re: RegExp, rows: Array<{ el: HTMLElement; top: number; height: number }>) {
  for (const { el, top, height } of rows) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top,
      toJSON: () => ({}),
    } as DOMRect);
  }
}

describe('pointer drag reorder', () => {
  it('shows no drag handles in read-only history or on done todos', async () => {
    useAppStore.getState().addTodo({ title: 'Pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'Finished', priority: 'high', scheduledDay: '2026-08-18' });
    const done = Object.values(useAppStore.getState().todos).find((t) => t.title === 'Finished')!;
    useAppStore.getState().toggleDone(done.id);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Reorder todo: Pending' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder todo: Finished' })).not.toBeInTheDocument();
  });

  it('band separators appear only while dragging', () => {
    useAppStore.getState().addTodo({ title: 'Solo', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    expect(container.querySelector('[class*="bandSeparator"]')).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Reorder todo: Solo' }), { pointerId: 1, clientY: 10 });
    expect(container.querySelectorAll('[class*="bandSeparator"]')).toHaveLength(3); // High, Medium, Low
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Reorder todo: Solo' }), { pointerId: 1, clientY: 10 });
    expect(container.querySelector('[class*="bandSeparator"]')).toBeNull();
  });

  it('drops a todo at a new slot in its own band', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'C', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: C' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 250 });
    // Layout: separators High@0, Medium@40, Low@400; items A@80, B@160, C@240 (height 60).
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects(/./, [
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 40, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 80, height: 60 }, { el: items[1], top: 160, height: 60 },
      { el: items[2], top: 240, height: 60 },
    ]);
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 }); // above A's midpoint? A mid=110 → index 0
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });
    const s = useAppStore.getState();
    const fn = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['C', 'A', 'B']);
  });

  it('dropping in another band re-prioritizes', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'H', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'M', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: M' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200 });
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects(/./, [
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 120, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 40, height: 60 }, { el: items[1], top: 160, height: 60 },
    ]);
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 30 }); // above Medium sep → High band, below H's mid(70)? 30 < 70 → index 0
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 30 });
    const m = Object.values(useAppStore.getState().todos).find((t) => t.title === 'M')!;
    expect(m.priority).toBe('high');
    expect(m.sortIndex).toBe(0);
  });

  it('pointercancel aborts without committing', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: B' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(Object.values(useAppStore.getState().todos).every((t) => t.sortIndex === undefined)).toBe(true);
  });
});
```

Adjust imports at the top of the test file as needed (`selectTodosForDay` from `../../store/selectors`, `within`/`fireEvent` from RTL). If `class*=` selectors clash with the file's conventions, an `aria-hidden` + text query (`High`/`Medium`/`Low`) works too — the separators contain their band label as text.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/board/board.test.tsx`
Expected: new tests FAIL (`Unable to find … 'Reorder todo: …'`); existing board tests still PASS.

- [ ] **Step 3: Implement the hook `src/hooks/useDragReorder.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/store';
import { bandPosition } from '../domain/reorder';
import type { Priority, Todo } from '../domain/types';

export interface DragTarget { priority: Priority; index: number }

/** Hand-rolled pointer-events reorder for the day column's pending todos
 *  (spec §4). One instance per DayColumn; TodoItem receives handle props.
 *  Dragging holds NO store state — the drop commits via reorderTodo; a
 *  cancel (pointercancel, view change) discards everything. */
export function useDragReorder(pendingTodos: Todo[], viewKey: string) {
  const reorderTodo = useAppStore((s) => s.reorderTodo);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [target, setTarget] = useState<DragTarget | null>(null);
  const startY = useRef(0);
  const items = useRef(new Map<string, HTMLElement>());
  const separators = useRef(new Map<Priority, HTMLElement>());

  // A view switch mid-drag must not commit onto the new view (spec §4).
  useEffect(() => {
    setDragId(null);
    setTarget(null);
    setDragOffset(0);
  }, [viewKey]);

  const registerItem = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) items.current.set(id, el);
    else items.current.delete(id);
  }, []);

  const registerSeparator = useCallback((p: Priority) => (el: HTMLElement | null) => {
    if (el) separators.current.set(p, el);
    else separators.current.delete(p);
  }, []);

  const computeTarget = (clientY: number, id: string): DragTarget => {
    const topOf = (p: Priority) => {
      const el = separators.current.get(p);
      return el ? el.getBoundingClientRect().top : Infinity;
    };
    const priority: Priority =
      clientY < topOf('medium') ? 'high' : clientY < topOf('low') ? 'medium' : 'low';
    let index = 0;
    for (const t of pendingTodos) {
      if (t.priority !== priority || t.id === id) continue;
      const el = items.current.get(t.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 < clientY) index += 1;
    }
    return { priority, index };
  };

  const getHandleProps = (todo: Todo): React.HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // jsdom (and old browsers) lack pointer capture — optional call.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      startY.current = e.clientY;
      setDragId(todo.id);
      setDragOffset(0);
      const pos = bandPosition(useAppStore.getState().todos, todo.id);
      setTarget(pos ? { priority: pos.priority, index: pos.index } : null);
    },
    onPointerMove: (e) => {
      if (dragId !== todo.id) return;
      setDragOffset(e.clientY - startY.current);
      setTarget(computeTarget(e.clientY, todo.id));
    },
    onPointerUp: (e) => {
      if (dragId !== todo.id) return;
      const final = computeTarget(e.clientY, todo.id);
      setDragId(null);
      setTarget(null);
      setDragOffset(0);
      reorderTodo(todo.id, final.priority, final.index);
    },
    onPointerCancel: () => {
      setDragId(null);
      setTarget(null);
      setDragOffset(0);
    },
  });

  return { dragId, dragOffset, target, getHandleProps, registerItem, registerSeparator };
}
```

- [ ] **Step 4: Add the handle to `TodoItem.tsx`**

New prop (optional, so nothing else breaks):

```ts
export interface ReorderProps {
  handleProps: React.HTMLAttributes<HTMLButtonElement>;
  itemRef: (el: HTMLElement | null) => void;
  dragging: boolean;
  dragOffset: number;
}

export function TodoItem({ todo, readOnly, reorder }: {
  todo: Todo; readOnly: boolean; reorder?: ReorderProps;
}) {
```

On the `<li>`: `ref={reorder?.itemRef}`, and extend the className:

```tsx
    <li
      ref={reorder?.itemRef}
      className={reorder?.dragging ? `${styles.item} ${styles.itemDragging}` : styles.item}
      style={reorder?.dragging ? { transform: `translateY(${reorder.dragOffset}px)` } : undefined}
      data-done={todo.done ? '' : undefined}
    >
```

Inside `styles.row`, as the FIRST child (before the checkbox), render the handle only for pending todos in an editable view:

```tsx
        {!readOnly && !todo.done && reorder && (
          <button
            type="button"
            className={styles.handle}
            aria-label={`Reorder todo: ${todo.title}`}
            {...reorder.handleProps}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
        )}
```

(Task 6 adds the keyboard behavior to this same button — keep `{...reorder.handleProps}` last so Task 6 can compose handlers explicitly.)

`TodoItem.module.css` additions (tokens only):

```css
.handle {
  flex: 0 0 auto;
  padding: 0 var(--space-1);
  margin-top: 0.1rem;
  border: none;
  background: none;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  line-height: var(--line-height-tight);
  letter-spacing: -0.15em;
  cursor: grab;
  touch-action: none; /* pointer events must win over touch scrolling */
}

.handle:hover {
  color: var(--color-text);
}

.itemDragging {
  position: relative;
  z-index: 1;
  opacity: 0.85;
  box-shadow: var(--shadow-lg);
  cursor: grabbing;
}
```

- [ ] **Step 5: Rework `DayColumn`'s todo list rendering**

In `DayColumn.tsx`, wire the hook and split pending/done. Replace the current single-line `todos.map(...)` rendering (line 83) with the band-aware version. Above the `return`:

```ts
  const pending = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const drag = useDragReorder(pending, `${fn.id}:${day}`);
```

⚠️ **Hook-order constraint:** `DayColumn` currently early-returns `if (!fn) return null;` before computing `todos`. Hooks must run unconditionally — restructure so `useDragReorder` is called before the early return, e.g. compute `const pending = ...` from guarded expressions (`fn ? ... : []`) above the `if (!fn)` line:

```ts
  const day = state.selectedDay ?? fn?.days[0] ?? null;
  const todos = fn && day ? selectTodosForDay(state, fn.id, day) : [];
  const pending = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const drag = useDragReorder(pending, `${fn?.id ?? ''}:${day ?? ''}`);
  if (!fn || !day) return null;
```

(Delete the old `const day = ...`/`const todos = ...` lines inside the post-guard section; `readOnly`/`notes` stay where they are.)

List rendering — one `<ul>`, band separators + drop indicator only while dragging, done todos always at the end:

```tsx
{todos.length === 0
  ? <EmptyState message="No todos for this day" />
  : (
    <ul className={styles.list}>
      {(['high', 'medium', 'low'] as const).map((priority) => {
        const band = pending.filter((t) => t.priority === priority);
        const rows: React.ReactNode[] = [];
        if (drag.dragId !== null) {
          rows.push(
            <li key={`sep-${priority}`} aria-hidden="true"
                ref={drag.registerSeparator(priority)} className={styles.bandSeparator}>
              {priority === 'high' ? 'High' : priority === 'medium' ? 'Medium' : 'Low'}
            </li>,
          );
        }
        band.forEach((t, i) => {
          if (drag.dragId !== null && drag.target?.priority === priority
              && drag.target.index === i && drag.dragId !== t.id) {
            rows.push(<li key={`ind-${priority}-${i}`} aria-hidden="true" className={styles.dropIndicator} />);
          }
          rows.push(
            <TodoItem key={t.id} todo={t} readOnly={readOnly}
              reorder={readOnly ? undefined : {
                handleProps: drag.getHandleProps(t),
                itemRef: drag.registerItem(t.id),
                dragging: drag.dragId === t.id,
                dragOffset: drag.dragOffset,
              }} />,
          );
        });
        if (drag.dragId !== null && drag.target?.priority === priority
            && drag.target.index >= band.filter((t) => t.id !== drag.dragId).length
            && !(band.length === 1 && band[0].id === drag.dragId)) {
          rows.push(<li key={`ind-${priority}-end`} aria-hidden="true" className={styles.dropIndicator} />);
        }
        return rows;
      })}
      {doneTodos.map((t) => <TodoItem key={t.id} todo={t} readOnly={readOnly} />)}
    </ul>
  )}
```

(The indicator-at-end condition: show the trailing indicator when the target index lands after every non-dragged band member — but not when the dragged todo is the band's only member, where the indicator would be noise. If this exact condition proves fiddly in review, simplifying to always-show-at-target is acceptable; the tests assert order outcomes, not indicator placement.)

`DayColumn.module.css` additions:

```css
.bandSeparator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.bandSeparator::after {
  content: '';
  flex: 1;
  border-top: 1px dashed var(--color-border-strong);
}

.dropIndicator {
  height: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-focus-ring);
}
```

- [ ] **Step 6: Run the new tests until green**

Run: `npx vitest run src/components/board/board.test.tsx`
Expected: PASS. The rect-mock coordinates in the tests were chosen against this exact implementation (separator `top` defines band boundaries; item midpoints define indices) — if a test fails, debug the geometry with `screen.debug()` before touching either side.

- [ ] **Step 7: Full gate + commit**

Run: `npm run verify` → green (todos.test.tsx and useShortcuts.test.tsx must be unaffected — the handle is a plain button and claims no global keys).

```bash
git add src/hooks/useDragReorder.ts src/components/todos/TodoItem.tsx src/components/todos/TodoItem.module.css src/components/board/DayColumn.tsx src/components/board/DayColumn.module.css src/components/board/board.test.tsx
git commit -m "feat(board): pointer-drag reorder with priority band targets"
```

---

### Task 6: Keyboard grab flow on the handle

**Files:**
- Modify: `src/components/todos/TodoItem.tsx`
- Test: `src/components/todos/todos.test.tsx`

**Interfaces:**
- Consumes: store `reorderTodo` + `announce` (Task 4), domain `moveTarget` + `bandPosition` (Task 1), the handle button from Task 5.
- Produces: handle keyboard contract — `Space`/`Enter` toggles grab (`aria-pressed`), grabbed `↑`/`↓` move (each move announced by the store action), `Escape` cancels back to the grab-time snapshot, blur drops in place.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/todos/todos.test.tsx`:

```ts
describe('keyboard reorder on the drag handle', () => {
  function titlesOnBoard() {
    const s = useAppStore.getState();
    const fn = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    return selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
  }

  it('grabs with Space, moves with arrows, drops with Space', async () => {
    const user = userEvent.setup();
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: B' });
    handle.focus();
    await user.keyboard(' ');
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{ArrowUp}');
    expect(titlesOnBoard()).toEqual(['B', 'A']);
    expect(useAppStore.getState().announcement).toBe('Moved "B" to Medium, position 1 of 2');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Reorder todo: B' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('crossing a band boundary with arrows changes priority', async () => {
    const user = userEvent.setup();
    const st = useAppStore.getState();
    st.addTodo({ title: 'H', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'M', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: M' });
    handle.focus();
    await user.keyboard(' {ArrowUp}');
    const m = Object.values(useAppStore.getState().todos).find((t) => t.title === 'M')!;
    expect(m.priority).toBe('high');
  });

  it('Escape cancels back to the grab-time position and priority', async () => {
    const user = userEvent.setup();
    const st = useAppStore.getState();
    st.addTodo({ title: 'H', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'M', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: M' });
    handle.focus();
    await user.keyboard(' {ArrowUp}{Escape}');
    const m = Object.values(useAppStore.getState().todos).find((t) => t.title === 'M')!;
    expect(m.priority).toBe('medium');
    expect(screen.getByRole('button', { name: 'Reorder todo: M' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('arrow keys on an ungrabbed handle do nothing', async () => {
    const user = userEvent.setup();
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    screen.getByRole('button', { name: 'Reorder todo: B' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(titlesOnBoard()).toEqual(['A', 'B']);
  });
});
```

Add `selectTodosForDay` to the test file's imports (`../../store/selectors`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/todos/todos.test.tsx`
Expected: new tests FAIL (no `aria-pressed`, no movement); existing todos tests PASS.

- [ ] **Step 3: Implement in `TodoItem.tsx`**

Imports: `import { bandPosition, moveTarget } from '../../domain/reorder';` and `import type { Priority } from '../../domain/types';` (extend existing type import). Component additions:

```ts
  const [grabbed, setGrabbed] = useState(false);
  const grabSnapshot = useRef<{ priority: Priority; index: number } | null>(null);
  const reorderTodo = useAppStore((s) => s.reorderTodo);
  const announce = useAppStore((s) => s.announce);
```

(`useRef` joins the existing react import.) Handlers:

```ts
  const toggleGrab = () => {
    if (grabbed) {
      setGrabbed(false);
      grabSnapshot.current = null;
      announce(`Dropped "${todo.title}"`);
    } else {
      const pos = bandPosition(useAppStore.getState().todos, todo.id);
      if (!pos) return;
      grabSnapshot.current = { priority: pos.priority, index: pos.index };
      setGrabbed(true);
      announce(`Grabbed "${todo.title}" — use arrow keys to move, Space to drop, Escape to cancel`);
    }
  };

  const onHandleKeyDown = (e: React.KeyboardEvent) => {
    if (!grabbed) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const t = moveTarget(useAppStore.getState().todos, todo.id, e.key === 'ArrowUp' ? -1 : 1);
      if (t) reorderTodo(todo.id, t.priority, t.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const snap = grabSnapshot.current;
      setGrabbed(false);
      grabSnapshot.current = null;
      if (snap) reorderTodo(todo.id, snap.priority, snap.index);
      announce(`Cancelled — "${todo.title}" returned to its place`);
    }
  };

  const onHandleBlur = () => {
    if (!grabbed) return;
    setGrabbed(false);
    grabSnapshot.current = null;
    announce(`Dropped "${todo.title}"`);
  };
```

Handle button becomes (note: `onClick` covers both Space and Enter on a native button; the pointer handlers from Task 5 spread last stay pointer-only, so the two paths don't collide — a mouse click produces `pointerdown`+`pointerup` at the same Y, a no-op reorder, and then `onClick`, which would grab. Suppress that: skip `toggleGrab` when the click came from a pointer — `e.detail > 0`):

```tsx
          <button
            type="button"
            className={styles.handle}
            aria-label={`Reorder todo: ${todo.title}`}
            aria-pressed={grabbed}
            onClick={(e) => { if (e.detail === 0) toggleGrab(); }}
            onKeyDown={onHandleKeyDown}
            onBlur={onHandleBlur}
            {...reorder.handleProps}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
```

(`e.detail === 0` = keyboard-originated click — the standard discriminator. Grabbed styling can reuse `styles.itemDragging`? No: keyboard moves commit instantly, so the card needs no lift; `aria-pressed` + the announcements are the state signal. Add a `.handle[aria-pressed='true'] { color: var(--color-focus-ring); }` rule to `TodoItem.module.css` so sighted keyboard users see the grab.)

- [ ] **Step 4: Run tests, then full gate**

Run: `npx vitest run src/components/todos/todos.test.tsx` → PASS, then `npm run verify` → green. Watch specifically: `useShortcuts.test.tsx` (global keys untouched) and `board.test.tsx` (pointer path unaffected — the spread order keeps Task 5's handlers intact).

- [ ] **Step 5: Commit**

```bash
git add src/components/todos/TodoItem.tsx src/components/todos/TodoItem.module.css src/components/todos/todos.test.tsx
git commit -m "feat(todos): keyboard grab-and-move reorder on the drag handle"
```

---

### Task 7: Help modal — Guide entry + Shortcuts rows

**Files:**
- Modify: `src/components/help/HelpModal.tsx`
- Test: `src/components/help/help.test.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: user-facing copy only.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/help/help.test.tsx`, following its existing render/query pattern (read the file first — it opens the modal via the header button or `?`):

```ts
  it('Guide tab documents reorder & re-prioritize', async () => {
    // open Help on the Guide tab per the file's existing helper/pattern
    expect(screen.getByText('Reorder & re-prioritize')).toBeInTheDocument();
    expect(screen.getByText(/Drag a todo by its handle/)).toBeInTheDocument();
  });

  it('Shortcuts tab lists the handle keys', async () => {
    // open Help on the Shortcuts tab per the file's existing pattern
    expect(screen.getByText('Grab or drop the focused todo handle')).toBeInTheDocument();
    expect(screen.getByText('Move a grabbed todo (crossing a group changes its priority)')).toBeInTheDocument();
    expect(screen.getByText('Cancel a grab')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: new tests FAIL; existing help tests PASS.

- [ ] **Step 3: Implement**

In `GUIDE_SECTIONS` (`HelpModal.tsx`), insert immediately after the `'Checklists'` entry (spec §5 says after "Todos & priorities"; Checklists already sits there, so this lands right after the todo-related entries, before Notes):

```ts
  {
    title: 'Reorder & re-prioritize',
    body: 'Drag a todo by its handle to reorder it within its priority group, or drop it in another group to change its priority. Incomplete todos that roll over to today line up after the ones you already arranged.',
  },
```

In `SHORTCUTS`, insert after the `P` row and before the `Esc` row:

```ts
  { combo: ['Space'], description: 'Grab or drop the focused todo handle' },
  { combo: ['↑', '↓'], description: 'Move a grabbed todo (crossing a group changes its priority)' },
  { combo: ['Esc'], description: 'Cancel a grab' },
```

- [ ] **Step 4: Run tests, then full gate**

Run: `npx vitest run src/components/help/help.test.tsx` → PASS, then `npm run verify` → green.

- [ ] **Step 5: Commit**

```bash
git add src/components/help/HelpModal.tsx src/components/help/help.test.tsx
git commit -m "docs(help): document drag reorder in Guide and Shortcuts tabs"
```

---

### Task 8: Docs sweep + final verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `enhancements.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: README**

Read `README.md`. Add to its feature list (matching its bullet style): drag & drop reordering of todos within priority groups, priority change by dropping in another group, full keyboard alternative. If the README has a shortcuts table, add the three handle-key rows from Task 7 (same wording).

- [ ] **Step 2: CLAUDE.md**

Two surgical edits:

1. In the **Keyboard model** paragraph of the Orientation section, append one sentence:

> Todo cards additionally carry a drag handle with element-local keys (`Space` grab/drop, `↑`/`↓` move, `Escape` cancel — see `TodoItem.tsx`); they coexist with the global listener by living on the handle element itself, and `↑`/`↓` are deliberately unclaimed globally.

2. `grep -n "createdAt" CLAUDE.md` — if any line describes `selectTodosForDay`'s sort order, update it to "priority band → `sortIndex` → `createdAt`". If none does (expected), skip. Do NOT add a new invariant — INV-5's write-discipline and INV-9's reducer-guard sections already cover this feature's obligations via the spec.

- [ ] **Step 3: enhancements.md**

Wrap the drag & drop line in an HTML comment marking it shipped, same pattern as the other shipped items:

```markdown
<!-- - ~~Poder hacer drag and drop por rangos, de high, med, and low.~~ Shipped: drag & drop reorder within priority bands, cross-band drop re-prioritizes, keyboard alternative on the handle (see `docs/superpowers/specs/2026-08-11-todo-drag-reorder-design.md`). -->
```

- [ ] **Step 4: Update the test count**

`npm run verify` prints the total test count — update the two places that cite "390 tests" (`CLAUDE.md` header/Commands table) to the new total.

- [ ] **Step 5: Final full gate**

Run: `npm run verify`
Expected: typecheck clean, ALL tests green. This is the definition of done.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md enhancements.md
git commit -m "docs: document drag & drop reorder; mark enhancement shipped"
```

---

## Self-review notes (already applied)

- **Spec coverage:** §1→Task 1+2, §2→Task 1+3, §3→Task 4, §4→Task 5, keyboard half of §4→Task 6, §5→Task 7, §6→spread across every task's tests, §7→Task 8, §8 (what didn't change) → enforced by the Global Constraints and each task's "untouched" notes.
- **Known deliberate deviations from spec text:** none. The spec's "exact signature left to the plan" for the append helper resolved to `appendToDay(todos, movedIds, fortnightId, day)`.
- **Type consistency:** `reorderTodo(id, targetPriority, targetIndex)` is the same triple at domain, store, and both UI paths; `bandPosition`/`moveTarget` return shapes match between Task 1 and Tasks 5/6.
- **Test-fixture caution:** Tasks 3, 5, 6, 7 say "read the target test file first and match its fixtures/helpers" — the snippets define the *contract*; local helper names (`mk`, fortnight fixtures, help-modal opener) must come from the real files.
