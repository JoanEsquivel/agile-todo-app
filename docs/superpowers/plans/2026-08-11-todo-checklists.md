# Todo Checklists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each todo can hold an optional checklist of sub-items, added/checked/removed inline on the todo card, with bidirectional completion (all items checked ⇔ todo done), per the approved spec `docs/superpowers/specs/2026-08-11-todo-checklists-design.md`.

**Architecture:** A new pure domain module `src/domain/checklist.ts` owns the completion invariant (for a non-empty checklist, `done === every item checked`, with `completedAt` stamped/cleared by the injected `now`); the store exposes three thin wrapper actions plus a `toggleDone` reimplemented over `setTodoDone`; all new UI lives on `TodoItem` behind a `2/5` disclosure counter. No schema bump — `Todo.checklist?` follows the documented `Note.rolledOver` precedent (optional nested field, `validatePersistedState` never descends into todo internals, INV-6 governs only top-level `PersistedState` keys).

**Tech Stack:** React 19 + TypeScript 7 (strict) + Zustand 5 (persist) + Vitest 4 + React Testing Library + CSS Modules. No new runtime dependencies.

## Global Constraints

- `npm run verify` is the definition of done — every task ends with it green.
- Never `npx tsc --noEmit` (it checks ZERO files at this repo root and exits 0); always `npm run typecheck` / `npm run verify`.
- Vitest `globals: true` — never `import { describe, it, expect, vi } from 'vitest'`.
- The clock is mocked by mocking the clock **module** (`vi.mock('./clock', ...)` / `vi.mock('../../store/clock', ...)`), never `vi.setSystemTime`.
- Canonical fixture date: **2026-08-18 (a Tuesday)**; fortnight fixtures anchor on 2026-08-10 or 2026-08-17.
- Test queries are role/label-based (`getByRole('button', { name: ... })`, `getByLabelText(...)`) — no test-ids; every new interactive element gets an accessible name.
- CSS: tokens from `src/styles/tokens.css` only — no hard-coded hex/rgb; no `composes:`, no `:global`; parent-styles-from-child-state via `:has()`, never a new duplicate attribute.
- Boolean presence attributes: `data-x={cond ? '' : undefined}` — never `data-x={false}`. This feature adds **no new `data-*` attributes** at all.
- No new runtime dependencies (the set stays `react`, `react-dom`, `zustand`).
- `src/domain/` files import only their own domain siblings — no React, no zustand, no storage, no ambient time (`new Date()`/`Date.now()` stay confined to `src/store/clock.ts` and `src/hooks/useNow.ts`; domain functions take `now` as a parameter).
- **No schema bump for this feature** — `SCHEMA_VERSION` stays 3; no migration, no `partialize` change, no `validatePersistedState` change, no `importState` change.
- User-visible copy says "month", never "fortnight"; code identifiers keep the legacy `fortnight` naming — don't rename either direction.
- `readOnly` arrives at `TodoItem` as a prop from `DayColumn` (INV-9) — never derived inside the component; every mutating element is itself gated on `!readOnly`, not just its trigger.

---

### Task 1: Domain — `ChecklistItem` type, `Todo.checklist?`, and `src/domain/checklist.ts`

**Files:**
- Modify: `src/domain/types.ts` (add `ChecklistItem` interface after line 6, before the `Todo` interface; add `checklist?` field inside `Todo` after line 19, i.e. after `reminderAt?: LocalDateTime;`)
- Create: `src/domain/checklist.ts`
- Test (create): `src/domain/checklist.test.ts`

**Interfaces:**
- Consumes: `Todo`, `ISODateTime` from `src/domain/types.ts` (existing).
- Produces (later tasks rely on these exact signatures):
  - `interface ChecklistItem { id: string; text: string; checked: boolean }` (exported from `src/domain/types.ts`)
  - `Todo.checklist?: ChecklistItem[]` (optional; **never an empty array** — domain normalizes `[]` back to absent)
  - `toggleChecklistItem(todo: Todo, itemId: string, now: ISODateTime): Todo`
  - `addChecklistItem(todo: Todo, item: { id: string; text: string }, now: ISODateTime): Todo`
  - `removeChecklistItem(todo: Todo, itemId: string, now: ISODateTime): Todo`
  - `setTodoDone(todo: Todo, done: boolean, now: ISODateTime): Todo`
  - All are pure: new `Todo` returned, input never mutated. Empty/whitespace item **text handling is NOT here** — the store rejects empty text before calling the domain (Task 3).

- [ ] **Step 1: Write the failing test.** Create `src/domain/checklist.test.ts` with exactly this content:

```ts
import {
  addChecklistItem, removeChecklistItem, setTodoDone, toggleChecklistItem,
} from './checklist';
import type { ChecklistItem, Todo } from './types';

const NOW = '2026-08-18T12:00:00.000Z';
const EARLIER = '2026-08-17T09:00:00.000Z';

function makeTodo(over: Partial<Todo> = {}): Todo {
  return {
    id: 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

function item(id: string, checked = false): ChecklistItem {
  return { id, text: `item ${id}`, checked };
}

describe('toggleChecklistItem', () => {
  it('checks an unchecked item without completing while others remain unchecked', () => {
    const todo = makeTodo({ checklist: [item('a'), item('b')] });
    const res = toggleChecklistItem(todo, 'a', NOW);
    expect(res.checklist![0].checked).toBe(true);
    expect(res.checklist![1].checked).toBe(false);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('checking the last unchecked item completes the todo and stamps completedAt', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b')] });
    const res = toggleChecklistItem(todo, 'b', NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('unchecking any item of a done todo reopens it and clears completedAt', () => {
    const todo = makeTodo({
      done: true, completedAt: EARLIER, checklist: [item('a', true), item('b', true)],
    });
    const res = toggleChecklistItem(todo, 'a', NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist![0].checked).toBe(false);
    expect(res.checklist![1].checked).toBe(true);
  });

  it('leaves the todo semantically unchanged for an unknown item id', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    const res = toggleChecklistItem(todo, 'nope', NOW);
    expect(res.checklist).toEqual(todo.checklist);
    expect(res.done).toBe(false);
  });

  it('returns the todo as-is when it has no checklist', () => {
    const todo = makeTodo();
    expect(toggleChecklistItem(todo, 'a', NOW)).toBe(todo);
  });

  it('never mutates its input', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    toggleChecklistItem(todo, 'a', NOW);
    expect(todo.checklist![0].checked).toBe(false);
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
  });
});

describe('addChecklistItem', () => {
  it('appends the item unchecked, creating the checklist when absent', () => {
    const todo = makeTodo();
    const res = addChecklistItem(todo, { id: 'a', text: 'first' }, NOW);
    expect(res.checklist).toEqual([{ id: 'a', text: 'first', checked: false }]);
    expect(res.done).toBe(false);
  });

  it('adding an item to a completed checklist todo reopens it (the invariant wins)', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER, checklist: [item('a', true)] });
    const res = addChecklistItem(todo, { id: 'b', text: 'new step' }, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist).toHaveLength(2);
    expect(res.checklist![1]).toEqual({ id: 'b', text: 'new step', checked: false });
  });

  it('adding the first item to a done checklist-less todo also reopens it', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = addChecklistItem(todo, { id: 'a', text: 'first' }, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });
});

describe('removeChecklistItem', () => {
  it('removing the last unchecked item while the rest are checked auto-completes', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b', true), item('c')] });
    const res = removeChecklistItem(todo, 'c', NOW);
    expect(res.checklist).toHaveLength(2);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('removing a checked item does not complete while others are unchecked', () => {
    const todo = makeTodo({ checklist: [item('a', true), item('b')] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toEqual([item('b')]);
    expect(res.done).toBe(false);
  });

  it('removing the final remaining item normalizes checklist to undefined, done untouched (open todo)', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toBeUndefined();
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('removing the final remaining item of a DONE todo keeps it done with its original completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER, checklist: [item('a', true)] });
    const res = removeChecklistItem(todo, 'a', NOW);
    expect(res.checklist).toBeUndefined();
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(EARLIER);
  });

  it('returns the todo as-is when it has no checklist', () => {
    const todo = makeTodo();
    expect(removeChecklistItem(todo, 'a', NOW)).toBe(todo);
  });
});

describe('setTodoDone', () => {
  it('completes a checklist-less todo exactly like the manual toggle (stamps completedAt)', () => {
    const res = setTodoDone(makeTodo(), true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
  });

  it('reopening a checklist-less todo clears completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = setTodoDone(todo, false, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
  });

  it('completing checks every checklist item', () => {
    const todo = makeTodo({ checklist: [item('a'), item('b', true), item('c')] });
    const res = setTodoDone(todo, true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(NOW);
    expect(res.checklist!.every((i) => i.checked)).toBe(true);
  });

  it('reopening unchecks every checklist item', () => {
    const todo = makeTodo({
      done: true, completedAt: EARLIER, checklist: [item('a', true), item('b', true)],
    });
    const res = setTodoDone(todo, false, NOW);
    expect(res.done).toBe(false);
    expect(res.completedAt).toBeUndefined();
    expect(res.checklist!.every((i) => !i.checked)).toBe(true);
  });

  it('setting done=true on an already-done todo preserves the original completedAt', () => {
    const todo = makeTodo({ done: true, completedAt: EARLIER });
    const res = setTodoDone(todo, true, NOW);
    expect(res.done).toBe(true);
    expect(res.completedAt).toBe(EARLIER);
  });

  it('never mutates its input', () => {
    const todo = makeTodo({ checklist: [item('a')] });
    setTodoDone(todo, true, NOW);
    expect(todo.done).toBe(false);
    expect(todo.checklist![0].checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run src/domain/checklist.test.ts`. Expected failure: the whole file errors with a module-resolution failure — `Failed to resolve import "./checklist" from "src/domain/checklist.test.ts"` (the module does not exist yet). That is the red phase.

- [ ] **Step 3: Write the minimal implementation.** Two edits.

  **3a.** In `src/domain/types.ts`, insert this block between `export type NoteCategory = ...` (line 6) and `export interface Todo {` (line 8):

```ts
export interface ChecklistItem {
  id: string;                 // crypto.randomUUID(), generated by the STORE
                              // (never the domain) so domain stays deterministic
  text: string;
  checked: boolean;
}
```

  Then inside `interface Todo`, add this field directly after `reminderAt?: LocalDateTime;`:

```ts
  // Optional: absent (undefined) means "no checklist". NEVER an empty array
  // -- src/domain/checklist.ts normalizes [] back to undefined, because an
  // empty array would make the completion invariant (done === every item
  // checked) vacuously true. No schema bump needed -- same precedent as
  // Note.rolledOver: validatePersistedState never inspects todo internals,
  // only that `todos` is an object (INV-6 is for top-level PersistedState
  // fields, not nested value types).
  checklist?: ChecklistItem[];
```

  **3b.** Create `src/domain/checklist.ts` with exactly this content:

```ts
import type { ISODateTime, Todo } from './types';

/** Checklist completion invariant (spec 2026-08-11 §2): for a todo with a
 *  NON-EMPTY checklist, `done === every item checked`, always. Whenever a
 *  flip happens, false->true stamps `completedAt = now` and true->false
 *  clears it -- identical semantics to the manual toggle, regardless of
 *  which function caused the flip. A todo without a checklist is returned
 *  as-is (its `done` is owned by setTodoDone / the manual toggle alone).
 *
 *  INV-5 consequence, deliberate: auto-completion produces `done: true`
 *  exactly like manual completion, so the todo stops rolling over and stays
 *  pinned to the day/month it completed in (applyRollover and carryOverTodos
 *  both skip `done` todos). See the interplay tests in checklist.test.ts. */
function reconcileDone(todo: Todo, now: ISODateTime): Todo {
  if (!todo.checklist || todo.checklist.length === 0) return todo;
  const allChecked = todo.checklist.every((i) => i.checked);
  if (allChecked === todo.done) return todo;
  return { ...todo, done: allChecked, completedAt: allChecked ? now : undefined };
}

/** Flip one item's `checked`, then reconcile `done`/`completedAt` per the
 *  invariant. Checking the last unchecked item completes the todo;
 *  unchecking any item of a done todo reopens it. */
export function toggleChecklistItem(todo: Todo, itemId: string, now: ISODateTime): Todo {
  if (!todo.checklist) return todo;
  const checklist = todo.checklist.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
  return reconcileDone({ ...todo, checklist }, now);
}

/** Append the item unchecked, then reconcile: adding an item to a completed
 *  todo REOPENS it (the invariant wins). The id is generated by the caller
 *  (the store, same crypto.randomUUID() mechanism as addTodo). Text
 *  trimming/rejection is the store's job, not the domain's. */
export function addChecklistItem(
  todo: Todo,
  item: { id: string; text: string },
  now: ISODateTime,
): Todo {
  const checklist = [...(todo.checklist ?? []), { id: item.id, text: item.text, checked: false }];
  return reconcileDone({ ...todo, checklist }, now);
}

/** Remove the item, then reconcile: removing the last UNCHECKED item while
 *  the rest are checked auto-completes the todo. Removing the final
 *  remaining item normalizes `checklist` back to undefined (never an empty
 *  array) and leaves `done` exactly as it was. */
export function removeChecklistItem(todo: Todo, itemId: string, now: ISODateTime): Todo {
  if (!todo.checklist) return todo;
  const remaining = todo.checklist.filter((i) => i.id !== itemId);
  if (remaining.length === 0) {
    const { checklist: _removed, ...rest } = todo;
    return rest;
  }
  return reconcileDone({ ...todo, checklist: remaining }, now);
}

/** The parent toggle. Sets `done` (stamping completedAt on false->true,
 *  preserving it when already done, clearing it on ->false) and, if a
 *  checklist exists, sets EVERY item's `checked` to match -- this is what
 *  makes "check the parent -> check all sub-items" and its mirror hold. */
export function setTodoDone(todo: Todo, done: boolean, now: ISODateTime): Todo {
  const completedAt = done ? (todo.done ? todo.completedAt : now) : undefined;
  const next: Todo = { ...todo, done, completedAt };
  if (todo.checklist) {
    next.checklist = todo.checklist.map((i) => (i.checked === done ? i : { ...i, checked: done }));
  }
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run `npx vitest run src/domain/checklist.test.ts` — expect all 20 tests green. Then run `npm run verify` — expect typecheck clean and the full suite green (the new field is optional and additive, so nothing else moves).

- [ ] **Step 5: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add src/domain/types.ts src/domain/checklist.ts src/domain/checklist.test.ts
git commit -m "$(cat <<'EOF'
feat: checklist domain model — ChecklistItem + completion-invariant functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

### Task 2: Domain interplay tests — auto-completed todos are skipped by rollover and carry-over (INV-5)

**Files:**
- Test (modify): `src/domain/checklist.test.ts` (append a describe block at the end of the file; extend the import lines at the top)

**Interfaces:**
- Consumes: `toggleChecklistItem(todo: Todo, itemId: string, now: ISODateTime): Todo` from Task 1; existing `applyRollover(todos: Record<string, Todo>, fortnight: Fortnight, today: ISODate): { todos; changed }` from `src/domain/rollover.ts`; existing `carryOverTodos(todos: Record<string, Todo>, oldFortnightId: string, newFortnight: Fortnight, today: ISODate): Record<string, Todo>` from `src/domain/fortnight.ts`.
- Produces: nothing new — this task pins down the INV-5 consequence the spec (§2) demands be tested explicitly rather than left implicit.

> Note on TDD shape: this is a **characterization test** of an interaction that must already hold once Task 1 exists (`applyRollover`/`carryOverTodos` key on `todo.done`, which auto-completion sets exactly like manual completion). There is no red phase by design — if these tests fail, that is a bug in Task 1's implementation and must be fixed **there**, not by changing `rollover.ts`/`fortnight.ts` (the spec says those files do not change).

- [ ] **Step 1: Write the test.** In `src/domain/checklist.test.ts`, replace the two import statements at the top of the file:

```ts
import {
  addChecklistItem, removeChecklistItem, setTodoDone, toggleChecklistItem,
} from './checklist';
import type { ChecklistItem, Todo } from './types';
```

with:

```ts
import {
  addChecklistItem, removeChecklistItem, setTodoDone, toggleChecklistItem,
} from './checklist';
import { applyRollover } from './rollover';
import { carryOverTodos } from './fortnight';
import type { ChecklistItem, Fortnight, Todo } from './types';
```

Then append this describe block at the very end of the file (it reuses the file's existing `makeTodo`, `item`, and `NOW` helpers):

```ts
describe('checklist auto-completion vs rollover/carry-over (INV-5 consequence, spec §2)', () => {
  // Literal 10-day fortnight fixture (deliberately NOT generateMonthDays —
  // same living-proof convention as rollover.test.ts / carryOver.test.ts).
  const f1: Fortnight = {
    id: 'f1', startDay: '2026-08-10',
    days: [
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    ],
    createdAt: '2026-08-10T12:00:00.000Z',
  };

  /** A todo completed BY ITS CHECKLIST (never a manual toggle): checking the
   *  last unchecked item is what flips done. */
  function autoCompleted(id: string): Todo {
    const base = makeTodo({
      id, scheduledDay: '2026-08-10', checklist: [item('c1', true), item('c2', false)],
    });
    const completed = toggleChecklistItem(base, 'c2', NOW);
    expect(completed.done).toBe(true); // sanity: completion came from the checklist
    return completed;
  }

  it('applyRollover skips a checklist-auto-completed todo, exactly like a manually completed one', () => {
    const todos = {
      a: autoCompleted('a'),
      control: makeTodo({ id: 'control', scheduledDay: '2026-08-10' }),
    };
    const res = applyRollover(todos, f1, '2026-08-12');
    expect(res.todos.control.scheduledDay).toBe('2026-08-12'); // the run itself did move things
    expect(res.todos.a.scheduledDay).toBe('2026-08-10');       // ...but not the completed todo
    expect(res.todos.a.rolledOver).toBe(false);
    expect(res.todos.a.checklist).toEqual([item('c1', true), item('c2', true)]);
  });

  it('carryOverTodos leaves a checklist-auto-completed todo pinned to its old fortnight', () => {
    const f2: Fortnight = {
      id: 'f2', startDay: '2026-08-17',
      days: [
        '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
        '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      ],
      createdAt: '2026-08-19T12:00:00.000Z',
    };
    const todos = {
      a: autoCompleted('a'),
      control: makeTodo({ id: 'control', scheduledDay: '2026-08-11' }),
    };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.control.fortnightId).toBe('f2'); // the run itself did migrate things
    expect(res.a.fortnightId).toBe('f1');       // ...but the completed todo stays in history
    expect(res.a.scheduledDay).toBe('2026-08-10');
    expect(res.a.checklist).toEqual([item('c1', true), item('c2', true)]); // rides along untouched
  });
});
```

- [ ] **Step 2: Run the test and verify it passes.** Run `npx vitest run src/domain/checklist.test.ts` — expect all 22 tests green on the first run (see the TDD-shape note above). If either interplay test is red, fix `src/domain/checklist.ts` (Task 1's file) until `done`/`completedAt` semantics match manual completion; do NOT touch `rollover.ts` or `fortnight.ts`.

- [ ] **Step 3: Run the full gate.** Run `npm run verify` — expect green.

- [ ] **Step 4: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add src/domain/checklist.test.ts
git commit -m "$(cat <<'EOF'
test: checklist auto-completion is gated by INV-5 like manual completion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

### Task 3: Store — checklist actions + `toggleDone` delegates to `setTodoDone` + persistence round-trip

**Files:**
- Modify: `src/store/store.ts` (new import after line 9; three new action signatures in `interface AppState` after line 61, i.e. after `deleteTodo: (id: string) => void;`; replace the `toggleDone` implementation at lines 282–287; three new action implementations after the `deleteTodo` implementation, lines 289–293)
- Test (modify): `src/store/store.test.ts` (append a new top-level describe at end of file, line 216)
- Test (modify): `src/store/storePersistence.test.ts` (add one test after the `round-trips note.rolledOver...` test, which ends at line 208)

**Interfaces:**
- Consumes (from Task 1, `src/domain/checklist.ts`): `setTodoDone(todo: Todo, done: boolean, now: ISODateTime): Todo`, `addChecklistItem(todo, { id, text }, now): Todo`, `toggleChecklistItem(todo, itemId, now): Todo`, `removeChecklistItem(todo, itemId, now): Todo`.
- Produces (store actions on `AppState`; Task 4's UI calls exactly these):
  - `addChecklistItem: (todoId: string, text: string) => void` — trims text, silently no-ops on empty/whitespace-only, generates the item id via `crypto.randomUUID()` (same mechanism as `addTodo`)
  - `toggleChecklistItem: (todoId: string, itemId: string) => void`
  - `removeChecklistItem: (todoId: string, itemId: string) => void`
  - `toggleDone: (id: string) => void` — unchanged signature, now checklist-aware.
- Explicitly NOT changed: `updateTodo`'s patch allowlist, `partialize`, `SCHEMA_VERSION`/migrations, `validatePersistedState`, `importState` (checklist lives inside `todos`, which is already copied field-by-field).

- [ ] **Step 1: Write the failing tests.** Append to `src/store/store.test.ts` (end of file — after the closing `});` of the `pomodoro actions` describe). The file already mocks `./clock` with the mutable `clock.iso` (reset to `'2026-08-18T12:00:00.000Z'` by `reset()`), so `completedAt` assertions use that literal:

```ts
describe('checklist actions', () => {
  beforeEach(reset);

  function seedTodo(): string {
    useAppStore.getState().initApp();
    useAppStore.getState().addTodo({ title: 'Big task', priority: 'medium', scheduledDay: '2026-08-18' });
    return Object.values(useAppStore.getState().todos)[0].id;
  }

  it('addChecklistItem appends an unchecked item with trimmed text and a generated id', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, '  first part  ');
    const checklist = useAppStore.getState().todos[id].checklist!;
    expect(checklist).toHaveLength(1);
    expect(checklist[0]).toMatchObject({ text: 'first part', checked: false });
    expect(checklist[0].id).toEqual(expect.any(String));
    expect(checklist[0].id).not.toBe('');
  });

  it('addChecklistItem rejects empty and whitespace-only text', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, '');
    useAppStore.getState().addChecklistItem(id, '   ');
    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
  });

  it('toggleChecklistItem checking the last item completes the todo; unchecking reopens it', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'only part');
    const itemId = useAppStore.getState().todos[id].checklist![0].id;

    useAppStore.getState().toggleChecklistItem(id, itemId);
    let todo = useAppStore.getState().todos[id];
    expect(todo.checklist![0].checked).toBe(true);
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');

    useAppStore.getState().toggleChecklistItem(id, itemId);
    todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
  });

  it('toggleDone on a checklist todo syncs every item both ways', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');

    useAppStore.getState().toggleDone(id);
    let todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');
    expect(todo.checklist!.every((i) => i.checked)).toBe(true);

    useAppStore.getState().toggleDone(id);
    todo = useAppStore.getState().todos[id];
    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeUndefined();
    expect(todo.checklist!.every((i) => !i.checked)).toBe(true);
  });

  it('removeChecklistItem removes one item; removing the final item clears the checklist field', () => {
    const id = seedTodo();
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');
    const [a, b] = useAppStore.getState().todos[id].checklist!;

    useAppStore.getState().removeChecklistItem(id, a.id);
    expect(useAppStore.getState().todos[id].checklist).toHaveLength(1);
    expect(useAppStore.getState().todos[id].checklist![0].id).toBe(b.id);

    useAppStore.getState().removeChecklistItem(id, b.id);
    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
  });
});
```

Then add to `src/store/storePersistence.test.ts`, immediately after the test `round-trips note.rolledOver through export -> import, ...` (after its closing `});` at line 208) and inside the `store persistence` describe:

```ts
  it('round-trips a todo checklist through export -> import', () => {
    useAppStore.getState().initApp();
    const fn = useAppStore.getState().fortnights[0];
    const checklist = [
      { id: 'c1', text: 'done part', checked: true },
      { id: 'c2', text: 'open part', checked: false },
    ];
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {
        t1: {
          id: 't1', fortnightId: fn.id, title: 'with checklist', priority: 'medium' as const,
          scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
          rolledOver: false, checklist,
        },
      },
      notes: {},
      lastRolloverDay: '2026-08-18',
      pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
    };
    const parsed = parseBackup(serializeState(snapshot));
    expect(parsed.todos.t1.checklist).toEqual(checklist);

    useAppStore.getState().importState(parsed);
    expect(useAppStore.getState().todos.t1.checklist).toEqual(checklist);
  });
```

- [ ] **Step 2: Run tests to verify they fail.** Run `npx vitest run src/store/store.test.ts` — expect all five new `checklist actions` tests to fail with `TypeError: useAppStore.getState().addChecklistItem is not a function` (every one of them seeds items through that not-yet-existing action). Run `npx vitest run src/store/storePersistence.test.ts` — the round-trip test passes already at runtime (the checklist rides inside `todos` wholesale), which is fine: it is the regression guard the spec demands; `npm run typecheck` is the gate that would catch a `Todo` type without `checklist` here.

- [ ] **Step 3: Write the minimal implementation.** Three edits to `src/store/store.ts`.

  **3a.** After the existing import `import { applyRollover, applyNoteRollover } from '../domain/rollover';` (line 9), add:

```ts
import {
  setTodoDone,
  addChecklistItem as domainAddChecklistItem,
  toggleChecklistItem as domainToggleChecklistItem,
  removeChecklistItem as domainRemoveChecklistItem,
} from '../domain/checklist';
```

  **3b.** In `interface AppState`, directly after `deleteTodo: (id: string) => void;` (line 61), add:

```ts
  /** Generates the item id (crypto.randomUUID(), same mechanism as addTodo),
   *  trims the text, and silently rejects empty/whitespace-only input. */
  addChecklistItem: (todoId: string, text: string) => void;
  toggleChecklistItem: (todoId: string, itemId: string) => void;
  removeChecklistItem: (todoId: string, itemId: string) => void;
```

  **3c.** Replace the existing `toggleDone` implementation (lines 282–287):

```ts
        toggleDone: (id) =>
          set((s) => {
            const t = s.todos[id];
            const done = !t.done;
            return { todos: { ...s.todos, [id]: { ...t, done, completedAt: done ? nowIso() : undefined } } };
          }),
```

  with (byte-for-byte the old behavior for checklist-less todos — `setTodoDone` stamps/clears `completedAt` identically — plus the parent-toggle sync for checklist todos):

```ts
        toggleDone: (id) =>
          set((s) => ({ todos: { ...s.todos, [id]: setTodoDone(s.todos[id], !s.todos[id].done, nowIso()) } })),
```

  Then directly after the `deleteTodo` implementation's closing `}),` (line 293), add:

```ts
        addChecklistItem: (todoId, text) => {
          const trimmed = text.trim();
          if (trimmed === '') return;
          const itemId = crypto.randomUUID();
          set((s) => ({
            todos: {
              ...s.todos,
              [todoId]: domainAddChecklistItem(s.todos[todoId], { id: itemId, text: trimmed }, nowIso()),
            },
          }));
        },

        toggleChecklistItem: (todoId, itemId) =>
          set((s) => ({
            todos: { ...s.todos, [todoId]: domainToggleChecklistItem(s.todos[todoId], itemId, nowIso()) },
          })),

        removeChecklistItem: (todoId, itemId) =>
          set((s) => ({
            todos: { ...s.todos, [todoId]: domainRemoveChecklistItem(s.todos[todoId], itemId, nowIso()) },
          })),
```

- [ ] **Step 4: Run tests to verify they pass.** Run `npx vitest run src/store/store.test.ts src/store/storePersistence.test.ts` — expect green (including all pre-existing tests: the reimplemented `toggleDone` must not move the existing `addTodo / toggleDone / rescheduleTodo / deleteTodo` test). Then `npm run verify` — expect green.

- [ ] **Step 5: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add src/store/store.ts src/store/store.test.ts src/store/storePersistence.test.ts
git commit -m "$(cat <<'EOF'
feat: store checklist actions; toggleDone delegates to setTodoDone

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

### Task 4: UI — inline checklist on the todo card (`TodoItem` + module CSS)

**Files:**
- Modify: `src/components/todos/TodoItem.tsx` (whole file — currently 45 lines; full replacement below)
- Modify: `src/components/todos/TodoItem.module.css` (append new classes after `.actionButton`, line 101, before the `@media (prefers-reduced-motion: no-preference)` block at line 103)
- Test (modify): `src/components/todos/todos.test.tsx` (append a new describe after the existing `todos on the board` describe, line 101)
- NOT modified: `src/components/todos/TodoForm.tsx` (the spec keeps the form untouched), `DayColumn` (readOnly keeps arriving as a prop exactly as today).

**Interfaces:**
- Consumes (store actions from Task 3): `addChecklistItem(todoId: string, text: string): void`, `toggleChecklistItem(todoId: string, itemId: string): void`, `removeChecklistItem(todoId: string, itemId: string): void`; `Todo.checklist?: ChecklistItem[]` from Task 1.
- Produces (accessible names — tests and later docs rely on these exactly):
  - Progress toggle button: visible text `"{checked}/{total}"`, `aria-label` = `` `${checked}/${total} checklist items done` `` (visible text is a literal substring — WCAG 2.5.3), `aria-expanded` reflects the open state. Rendered only when the todo has a checklist; rendered in read-only mode too (disclosure is not a mutation).
  - Item checkbox: accessible name = the item's text (via wrapping `<label>`); `disabled` when `readOnly`.
  - Remove button: `aria-label` = `` `Remove ${item.text}` ``, visible text `Remove`; only when `!readOnly`.
  - Add input: `aria-label="Add checklist item"`; submit button `aria-label` = `` `Add checklist item to todo: ${todo.title}` ``, visible text `Add`; the whole add form renders only when `!readOnly`.
  - Actions-row door for checklist-less todos: `aria-label` = `` `Add checklist to todo: ${todo.title}` ``, visible text `Add checklist`, with `aria-expanded`; only when `!readOnly` (it sits inside the existing `!readOnly` actions row).
  - No new `data-*` attributes; checked-item styling uses `:has(input:checked)` in the module CSS.
  - Expansion is local `useState`, collapsed by default, ephemeral (dies with the card; nothing persists) — the card unmounts on month switches, so no extra reset effect is needed.

- [ ] **Step 1: Write the failing tests.** Append to `src/components/todos/todos.test.tsx` (after the closing `});` of the `todos on the board` describe at line 101). The file already imports `render`/`screen`, `userEvent`, `App`, `seedApp`, `useAppStore`, and mocks `../../store/clock`:

```tsx
describe('todo checklists', () => {
  beforeEach(() => seedApp());

  function addTodoReturningId(title: string): string {
    useAppStore.getState().addTodo({ title, priority: 'medium', scheduledDay: '2026-08-18' });
    return Object.values(useAppStore.getState().todos).find((t) => t.title === title)!.id;
  }

  it('Add checklist opens the add form focused and creates the first item', async () => {
    const user = userEvent.setup();
    addTodoReturningId('Big task');
    render(<App />);

    const door = screen.getByRole('button', { name: 'Add checklist to todo: Big task' });
    expect(door).toHaveAttribute('aria-expanded', 'false');
    await user.click(door);
    const input = screen.getByLabelText('Add checklist item');
    expect(input).toHaveFocus();

    await user.type(input, 'part one');
    await user.click(screen.getByRole('button', { name: 'Add checklist item to todo: Big task' }));

    expect(screen.getByRole('checkbox', { name: 'part one' })).not.toBeChecked();
    expect(input).toHaveValue('');
    // Once the first item exists the counter takes over as the toggle...
    expect(screen.getByRole('button', { name: '0/1 checklist items done' }))
      .toHaveAttribute('aria-expanded', 'true');
    // ...and the actions-row door is gone.
    expect(screen.queryByRole('button', { name: 'Add checklist to todo: Big task' }))
      .not.toBeInTheDocument();
  });

  it('renders a collapsed counter that expands to the item list', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');
    const firstItemId = useAppStore.getState().todos[id].checklist![0].id;
    useAppStore.getState().toggleChecklistItem(id, firstItemId);
    render(<App />);

    const counter = screen.getByRole('button', { name: '1/2 checklist items done' });
    expect(counter).toHaveTextContent('1/2'); // visible text is a literal substring of the name
    expect(counter).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'one' })).not.toBeInTheDocument();

    await user.click(counter);
    expect(counter).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'one' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'two' })).not.toBeChecked();
  });

  it('checking the last item completes the todo (data-done appears); unchecking reopens it', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'only part');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '0/1 checklist items done' }));
    await user.click(screen.getByRole('checkbox', { name: 'only part' }));
    expect(useAppStore.getState().todos[id].done).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Big task' })).toBeChecked();
    expect(screen.getByText('Big task').closest('li')).toHaveAttribute('data-done');

    await user.click(screen.getByRole('checkbox', { name: 'only part' }));
    expect(useAppStore.getState().todos[id].done).toBe(false);
    expect(screen.getByText('Big task').closest('li')).not.toHaveAttribute('data-done');
  });

  it('removes an item inline; removing the final item brings the Add checklist door back', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'doomed');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '0/1 checklist items done' }));
    await user.click(screen.getByRole('button', { name: 'Remove doomed' }));

    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
    expect(screen.queryByRole('checkbox', { name: 'doomed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add checklist to todo: Big task' })).toBeInTheDocument();
  });

  it('read-only history: checkboxes disabled, no add/remove/Add-checklist UI', async () => {
    const user = userEvent.setup();
    // Done todos stay behind when a new month is generated (carryOverTodos
    // skips done) — completing via the checklist pins both to the old,
    // soon-to-be read-only fortnight.
    const withChecklist = addTodoReturningId('Archived task');
    useAppStore.getState().addChecklistItem(withChecklist, 'sub one');
    const itemId = useAppStore.getState().todos[withChecklist].checklist![0].id;
    useAppStore.getState().toggleChecklistItem(withChecklist, itemId); // auto-completes it
    const plain = addTodoReturningId('Archived plain');
    useAppStore.getState().toggleDone(plain);

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);
    useAppStore.getState().selectDay('2026-08-18');
    render(<App />);

    // The counter still renders and expands — disclosure is not a mutation.
    await user.click(screen.getByRole('button', { name: '1/1 checklist items done' }));
    expect(screen.getByRole('checkbox', { name: 'sub one' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove sub one' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add checklist item')).not.toBeInTheDocument();
    // A checklist-less read-only todo shows nothing new at all.
    expect(screen.queryByRole('button', { name: 'Add checklist to todo: Archived plain' }))
      .not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail.** Run `npx vitest run src/components/todos/todos.test.tsx` — expect the five new tests to fail with `Unable to find an accessible element with the role "button" and name "Add checklist to todo: Big task"` (and the equivalent for the counter-based tests). The six pre-existing tests must still pass.

- [ ] **Step 3: Write the implementation.**

  **3a.** Replace the entire content of `src/components/todos/TodoItem.tsx` with:

```tsx
import { useState } from 'react';
import type { Todo } from '../../domain/types';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { PriorityBadge } from '../common/PriorityBadge';
import { TodoForm } from './TodoForm';
import { useNow } from '../../hooks/useNow';
import styles from './TodoItem.module.css';

export function TodoItem({ todo, readOnly }: { todo: Todo; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  // Ephemeral by spec: collapsed by default, dies with the card, never persisted.
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const toggleDone = useAppStore((s) => s.toggleDone);
  const deleteTodo = useAppStore((s) => s.deleteTodo);
  const addChecklistItem = useAppStore((s) => s.addChecklistItem);
  const toggleChecklistItem = useAppStore((s) => s.toggleChecklistItem);
  const removeChecklistItem = useAppStore((s) => s.removeChecklistItem);
  const fn = useAppStore(selectViewedFortnight);
  const now = useNow();
  const overdue = !todo.done && todo.reminderAt !== undefined && new Date(todo.reminderAt) <= now;

  const checklist = todo.checklist ?? [];
  const hasChecklist = checklist.length > 0;
  const checkedCount = checklist.filter((i) => i.checked).length;
  const progress = `${checkedCount}/${checklist.length}`;

  if (editing && fn) {
    return <TodoForm day={todo.scheduledDay} days={fn.days} todo={todo} onClose={() => setEditing(false)} />;
  }

  const submitNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    addChecklistItem(todo.id, newItemText); // store trims and rejects empty text
    setNewItemText('');
  };

  return (
    <li className={styles.item} data-done={todo.done ? '' : undefined}>
      <div className={styles.row}>
        <input className={styles.checkbox} type="checkbox" aria-label={todo.title} checked={todo.done}
          disabled={readOnly} onChange={() => toggleDone(todo.id)} />
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{todo.title}</span>
            <PriorityBadge priority={todo.priority} />
            {hasChecklist && (
              // Disclosure, not mutation — rendered in read-only mode too.
              // WCAG 2.5.3: the visible "2/5" stays a literal substring of
              // the accessible name.
              <button
                className={styles.progressToggle}
                aria-expanded={checklistOpen}
                aria-label={`${progress} checklist items done`}
                onClick={() => setChecklistOpen((open) => !open)}
              >
                {progress}
              </button>
            )}
            {overdue && <span className={styles.overdueBadge}>Overdue</span>}
            {todo.rolledOver && <span className={styles.rolloverBadge}>Rolled over</span>}
          </div>
          {todo.description && <p className={styles.description}>{todo.description}</p>}
        </div>
      </div>
      {checklistOpen && (hasChecklist || !readOnly) && (
        <div className={styles.checklist}>
          {hasChecklist && (
            <ul className={styles.checklistItems}>
              {checklist.map((item) => (
                <li key={item.id} className={styles.checklistItem}>
                  <label className={styles.checklistLabel}>
                    <input className={styles.checkbox} type="checkbox" checked={item.checked}
                      disabled={readOnly} onChange={() => toggleChecklistItem(todo.id, item.id)} />
                    <span className={styles.checklistText}>{item.text}</span>
                  </label>
                  {!readOnly && (
                    <button className={styles.actionButton} aria-label={`Remove ${item.text}`}
                      onClick={() => removeChecklistItem(todo.id, item.id)}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            // INV-9 rule 1: the mutating element itself is gated on
            // !readOnly, not just the buttons that reveal it. Typing here is
            // safe with the global shortcuts: they all bail while focus is
            // in a text-entry control.
            <form className={styles.checklistAdd} onSubmit={submitNewItem}>
              <input
                className={styles.checklistInput}
                aria-label="Add checklist item"
                value={newItemText}
                // Focus lands here only through the "Add checklist" door
                // (no checklist yet); a counter-expand never steals focus.
                autoFocus={!hasChecklist}
                onChange={(e) => setNewItemText(e.target.value)}
              />
              <button className={styles.actionButton} type="submit"
                aria-label={`Add checklist item to todo: ${todo.title}`}>Add</button>
            </form>
          )}
        </div>
      )}
      {!readOnly && (
        <div className={styles.actions}>
          {!hasChecklist && (
            <button className={styles.actionButton} aria-expanded={checklistOpen}
              onClick={() => setChecklistOpen((open) => !open)}
              aria-label={`Add checklist to todo: ${todo.title}`}>Add checklist</button>
          )}
          <button className={styles.actionButton} onClick={() => setEditing(true)} aria-label={`Edit todo: ${todo.title}`}>Edit</button>
          <button className={styles.actionButton} onClick={() => deleteTodo(todo.id)} aria-label={`Delete todo: ${todo.title}`}>Delete</button>
        </div>
      )}
    </li>
  );
}
```

  **3b.** In `src/components/todos/TodoItem.module.css`, insert the following block after the `.actionButton` rule (line 98–101) and before the `@media (prefers-reduced-motion: no-preference)` block (line 103). Tokens only; checked styling via `:has(input:checked)`, no new `data-*`:

```css
.progressToggle {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  padding: 0.125rem var(--space-2);
}

.progressToggle[aria-expanded='true'] {
  background: var(--color-ink-soft);
  color: var(--color-text);
}

.checklist {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-left: calc(1rem + var(--space-2));
}

.checklistItems {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.checklistItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.checklistLabel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  min-width: 0;
}

.checklistText {
  overflow-wrap: anywhere;
}

/* Parent styles from the child checkbox's semantic state via :has() —
 * INV-12/INV-13: no duplicated attribute, no new data-* vocabulary. */
.checklistItem:has(input:checked) .checklistText {
  color: var(--color-text-faint);
  text-decoration: line-through;
}

.checklistAdd {
  display: flex;
  gap: var(--space-2);
}

.checklistInput {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 4: Run tests to verify they pass.** Run `npx vitest run src/components/todos/todos.test.tsx` — expect all 11 tests (6 pre-existing + 5 new) green. Then `npm run verify` — expect green.

- [ ] **Step 5: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add src/components/todos/TodoItem.tsx src/components/todos/TodoItem.module.css src/components/todos/todos.test.tsx
git commit -m "$(cat <<'EOF'
feat: inline checklist UI on the todo card behind a 2/5 disclosure counter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

### Task 5: Help modal — Checklists guide section

**Files:**
- Modify: `src/components/help/HelpModal.tsx` (insert one entry into `GUIDE_SECTIONS`, immediately after the `'Todos & priorities'` entry at lines 22–25)
- Test (modify): `src/components/help/help.test.tsx` (extend the first test, lines 14–25)

**Interfaces:**
- Consumes: nothing from earlier tasks (copy-only change; the copy's claims are made true by Tasks 1–4).
- Produces: a `GUIDE_SECTIONS` entry titled `Checklists` — spec-final copy, every claim verifiable app behavior. No Shortcuts-tab change (no new shortcut exists).

- [ ] **Step 1: Write the failing test.** In `src/components/help/help.test.tsx`, replace the first test (`opens on the Guide tab and lists the feature guide`, lines 14–25) with:

```tsx
  it('opens on the Guide tab and lists the feature guide', () => {
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(within(dialog).getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tab', { name: 'Shortcuts' })).toHaveAttribute('aria-selected', 'false');
    const panel = within(dialog).getByRole('tabpanel');
    expect(panel).toHaveTextContent('Monthly board');
    expect(panel).toHaveTextContent('Automatic rollover');
    expect(panel).toHaveTextContent('Month history');
    expect(panel).toHaveTextContent('Checklists');
    expect(panel).toHaveTextContent('When every item is checked the todo completes itself');
    expect(panel).toHaveTextContent('Standup');
    expect(panel).toHaveTextContent('Backup & theme');
    // Placed right after the todos section, where the feature lives.
    const text = panel.textContent ?? '';
    expect(text.indexOf('Checklists')).toBeGreaterThan(text.indexOf('Todos & priorities'));
    expect(text.indexOf('Checklists')).toBeLessThan(text.indexOf('Notes: blockers & info'));
  });
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run src/components/help/help.test.tsx` — expect exactly one failure: `expect(panel).toHaveTextContent('Checklists')`.

- [ ] **Step 3: Write the minimal implementation.** In `src/components/help/HelpModal.tsx`, inside `GUIDE_SECTIONS`, insert this entry directly after the `'Todos & priorities'` object (i.e. between it and `'Notes: blockers & info'`):

```ts
  {
    title: 'Checklists',
    body: 'Use a todo\'s Add checklist action to break it into sub-items, then expand its counter (e.g. 2/5) to add, check off or remove them. When every item is checked the todo completes itself; unchecking an item reopens it. Checking the todo itself checks or clears the whole list.',
  },
```

- [ ] **Step 4: Run the test to verify it passes.** Run `npx vitest run src/components/help/help.test.tsx` — expect all tests green. Then `npm run verify` — expect green.

- [ ] **Step 5: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add src/components/help/HelpModal.tsx src/components/help/help.test.tsx
git commit -m "$(cat <<'EOF'
feat: document checklists in the Help guide

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

### Task 6: Docs — README feature bullet, test-count refresh, final full verify

**Files:**
- Modify: `README.md` (feature list bullet after line 16, the "Daily rollover" bullet; test count on line 7)
- Modify: `CLAUDE.md` (test-count references only — the header line and the `npm test` row of the Commands table; **no invariant changes**, per spec §7)

**Interfaces:**
- Consumes: the finished feature (Tasks 1–5 committed) and the real test count reported by `npm test`.
- Produces: user-facing docs that match the shipped app. All copy says "month"/"todo", never "fortnight".

- [ ] **Step 1: Capture the real test count.** Run `npm test` and read the summary line (`Tests  N passed`). Call that number **N** — use the literal number printed, everywhere "N" appears below. (Before this feature it was 344; Tasks 1–5 added roughly 33 tests, but the printed number is the only source of truth.)

- [ ] **Step 2: Update README.md.** Two edits:

  **2a.** Insert this bullet into the "What it does" list, directly after the "**Daily rollover**" bullet (line 16):

```markdown
- **Todo checklists** — break a todo into sub-items you add, check off and remove inline behind a `2/5` counter; when every item is checked the todo completes itself, unchecking one reopens it, and checking the todo itself checks or clears the whole list
```

  **2b.** On line 7, replace `344 tests · TypeScript strict · zero backend` with `N tests · TypeScript strict · zero backend` (N from Step 1).

- [ ] **Step 3: Update CLAUDE.md test counts.** Two occurrences, both replacing `344` with N from Step 1:
  - The header blockquote: `> This app is **finished, tested (344 tests), and deployed**.` → `tested (N tests)`.
  - The Commands table row: `| \`npm test\` | \`vitest run\` — 344 tests, ~4s |` → `— N tests, ~4s`.

  Change nothing else in CLAUDE.md — the spec (§7) records that INV-5 and INV-9 already describe this feature's obligations, so no invariant text moves.

- [ ] **Step 4: Final full verification.** Run `npm run verify` — expect typecheck clean and all N tests green. Also run the INV-1 check as a final sanity sweep: `grep -rn "toISOString()\s*\.\s*\(slice\|substring\|substr\|split\)" src/` must return nothing.

- [ ] **Step 5: Commit.**

```sh
cd /Users/ix-00233/Documents/GitHub/agile-todo-app
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add checklists to the README feature list; refresh test counts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SsxdZK9ev6zpUTCfsNZfCQ
EOF
)"
```

---

## Spec coverage map (self-review)

| Spec section | Where |
|---|---|
| §1 Data model (`ChecklistItem`, `Todo.checklist?`, no schema bump, `Note.rolledOver`-style comment) | Task 1 |
| §2 Domain functions + invariant + normalization + caller-generated ids | Task 1 |
| §2 INV-5 consequence tested explicitly | Task 2 |
| §3 Store (`toggleDone` via `setTodoDone`; three thin actions; trim/reject empty; no partialize/migration/importState change) | Task 3 |
| §4 UI (counter w/ `aria-expanded` + substring label; nested `<ul>`; remove buttons; add form; `Add checklist` door; read-only gating; `:has(input:checked)`; tokens-only CSS; no new `data-*`) | Task 4 |
| §5 Help modal entry (exact copy, placed after "Todos & priorities", no Shortcuts change) | Task 5 |
| §6 Testing (domain matrix; rollover interplay; store actions; export→import round trip; component behaviors incl. read-only; help guide) | Tasks 1–5 |
| §7 Docs (README feature list; CLAUDE.md untouched except test counts) | Task 6 |
| §8 What didn't change | No task touches `SCHEMA_VERSION`, migrations, `partialize`, `validatePersistedState`, `rollover.ts`, `fortnight.ts`, `TodoForm`, shortcuts, palette, existing `data-*`, or dependencies |
