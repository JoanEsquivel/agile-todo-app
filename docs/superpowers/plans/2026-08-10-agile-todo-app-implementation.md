# Agile Todo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Agile Todo App — a browser-only, backend-less fortnight (2-week) todo board with priorities, per-day notes (blocker/info), visual reminders, automatic daily rollover, fortnight regeneration with carry-over, and a daily standup modal.

**Architecture:** Pure domain core (`src/domain/` — date math, fortnight generation, rollover, carry-over, standup, reminders as pure functions taking `today`/`now` parameters) + thin Zustand store with versioned localStorage persistence + dumb React components. Spec: `docs/superpowers/specs/2026-08-10-agile-todo-app-design.md` (read it before starting; it contains the full type definitions, contracts, and edge-case decision table).

**Tech Stack:** React 18, TypeScript (strict), Vite, Zustand (+ `persist` middleware), Vitest, React Testing Library, CSS Modules.

## Global Constraints

- All UI copy in **English**. App title: **"Agile Todo"**. Package name: `agile-todo-app`.
- localStorage key: `agile-todo-app.v-state`. Schema version starts at `1`.
- Dependencies allowed: `react`, `react-dom`, `zustand` (runtime); `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@vitejs/plugin-react`, `typescript` (dev). **No other libraries** (no date libs, no UI kits, no routers).
- Domain functions are pure: no React, no storage, no ambient time. Only `src/store/clock.ts` may call `new Date()` / `Date.now()`.
- Dates: scheduling uses local `YYYY-MM-DD` strings (string comparison); timestamps use UTC ISO (`toISOString()`); reminders use zone-less `YYYY-MM-DDTHH:mm`. Never derive a schedule date via `toISOString().slice(0,10)`.
- Tests are colocated (`foo.test.ts` next to `foo.ts`). TDD every task: failing test → minimal implementation → green → commit.
- Test fixture dates: 2026-08-10 is a **Monday**. Week 1 = 2026-08-10…14, weekend = 15/16, week 2 = 2026-08-17…21.

---

### Task 1: Scaffold project + test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Vite + Vitest toolchain; `npm test` runs Vitest with jsdom + jest-dom matchers; `npm run dev` serves the app shell.

- [ ] **Step 1: Scaffold Vite app and install dependencies**

```bash
npm create vite@latest . -- --template react-ts
npm install zustand
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Set `"name": "agile-todo-app"` in `package.json` and add scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

If `tsconfig.app.json` has `"types"`, add `"vitest/globals"` to it.

- [ ] **Step 3: Write smoke test `src/smoke.test.ts`**

```ts
describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests and build to verify**

Run: `npm test` → Expected: 1 passed.
Run: `npm run build` → Expected: builds without error.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react-ts + vitest toolchain"
```

---

### Task 2: Domain types + date helpers

**Files:**
- Create: `src/domain/types.ts`, `src/domain/dates.ts`
- Test: `src/domain/dates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type in the spec §4 (`ISODate`, `ISODateTime`, `LocalDateTime`, `Priority`, `NoteCategory`, `Todo`, `Note`, `Fortnight`, `PersistedState`) and:
  - `toISODate(d: Date): ISODate`
  - `parseISODate(day: ISODate): Date` (local midnight)
  - `addDays(day: ISODate, n: number): ISODate`
  - `isWorkday(day: ISODate): boolean`
  - `mondayOfWeek(day: ISODate): ISODate`
  - `previousWorkday(day: ISODate): ISODate`
  - `nextWorkday(day: ISODate): ISODate`
  - `localDateOf(ts: ISODateTime): ISODate`
  - `formatDayLabel(day: ISODate): string` (e.g. "Mon, Aug 10")

- [ ] **Step 1: Copy the types from spec §4 into `src/domain/types.ts`** (verbatim — they are the single source of truth for the whole app).

- [ ] **Step 2: Write failing tests `src/domain/dates.test.ts`**

```ts
import {
  toISODate, parseISODate, addDays, isWorkday, mondayOfWeek,
  previousWorkday, nextWorkday, localDateOf,
} from './dates';

describe('dates', () => {
  it('toISODate uses local date fields', () => {
    expect(toISODate(new Date(2026, 7, 10))).toBe('2026-08-10');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('parseISODate round-trips at local midnight', () => {
    const d = parseISODate('2026-08-10');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 7, 10, 0]);
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('isWorkday is true Mon-Fri, false Sat/Sun', () => {
    expect(isWorkday('2026-08-10')).toBe(true);  // Monday
    expect(isWorkday('2026-08-14')).toBe(true);  // Friday
    expect(isWorkday('2026-08-15')).toBe(false); // Saturday
    expect(isWorkday('2026-08-16')).toBe(false); // Sunday
  });

  it('mondayOfWeek: weeks start Monday, Sunday belongs to the preceding Monday', () => {
    expect(mondayOfWeek('2026-08-12')).toBe('2026-08-10'); // Wednesday
    expect(mondayOfWeek('2026-08-10')).toBe('2026-08-10'); // Monday itself
    expect(mondayOfWeek('2026-08-15')).toBe('2026-08-10'); // Saturday
    expect(mondayOfWeek('2026-08-16')).toBe('2026-08-10'); // Sunday -> preceding Monday
  });

  it('previous/nextWorkday skip weekends', () => {
    expect(previousWorkday('2026-08-17')).toBe('2026-08-14'); // Mon -> Fri
    expect(previousWorkday('2026-08-12')).toBe('2026-08-11');
    expect(nextWorkday('2026-08-14')).toBe('2026-08-17');     // Fri -> Mon
    expect(nextWorkday('2026-08-15')).toBe('2026-08-17');     // Sat -> Mon
  });

  it('localDateOf converts a UTC timestamp to the local calendar day', () => {
    const ts = new Date(2026, 7, 10, 23, 30).toISOString(); // 23:30 local
    expect(localDateOf(ts)).toBe('2026-08-10');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./dates` not found).

- [ ] **Step 4: Implement `src/domain/dates.ts`**

```ts
import type { ISODate, ISODateTime } from './types';

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(day: ISODate): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: ISODate, n: number): ISODate {
  const d = parseISODate(day);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function isWorkday(day: ISODate): boolean {
  const dow = parseISODate(day).getDay(); // 0=Sun .. 6=Sat
  return dow >= 1 && dow <= 5;
}

export function mondayOfWeek(day: ISODate): ISODate {
  const dow = parseISODate(day).getDay();
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export function previousWorkday(day: ISODate): ISODate {
  let d = addDays(day, -1);
  while (!isWorkday(d)) d = addDays(d, -1);
  return d;
}

export function nextWorkday(day: ISODate): ISODate {
  let d = addDays(day, 1);
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
}

export function localDateOf(ts: ISODateTime): ISODate {
  return toISODate(new Date(ts));
}

export function formatDayLabel(day: ISODate): string {
  return parseISODate(day).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}
```

- [ ] **Step 5: Run tests to verify they pass, then commit**

Run: `npm test` → Expected: PASS.

```bash
git add src/domain
git commit -m "feat: domain types and pure local-date helpers"
```

---

### Task 3: Fortnight generation + effectiveBoardDay

**Files:**
- Create: `src/domain/fortnight.ts`
- Test: `src/domain/fortnight.test.ts`

**Interfaces:**
- Consumes: `dates.ts` helpers, `Fortnight` type.
- Produces:
  - `generateFortnightDays(anchor: ISODate): ISODate[]` — 10 workdays: Monday of anchor's week + Mon–Fri × 2.
  - `effectiveBoardDay(fortnight: Fortnight, today: ISODate): ISODate | null` — the day the board treats as "today" (`null` = fortnight expired).

- [ ] **Step 1: Write failing tests `src/domain/fortnight.test.ts`**

```ts
import { generateFortnightDays, effectiveBoardDay } from './fortnight';
import type { Fortnight } from './types';

const fn: Fortnight = {
  id: 'f1',
  startDay: '2026-08-10',
  days: generateFortnightDays('2026-08-10'),
  createdAt: '2026-08-10T12:00:00.000Z',
};

describe('generateFortnightDays', () => {
  it('produces 10 ascending workdays from the anchor week Monday', () => {
    expect(generateFortnightDays('2026-08-12')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    ]);
  });

  it('anchored on a weekend, still starts on that week Monday (Sunday -> preceding Monday)', () => {
    expect(generateFortnightDays('2026-08-16')[0]).toBe('2026-08-10');
    expect(generateFortnightDays('2026-08-15')[0]).toBe('2026-08-10');
  });
});

describe('effectiveBoardDay', () => {
  it('returns today when today is a fortnight day', () => {
    expect(effectiveBoardDay(fn, '2026-08-13')).toBe('2026-08-13');
  });

  it('weekend mid-fortnight resolves to the upcoming Monday', () => {
    expect(effectiveBoardDay(fn, '2026-08-15')).toBe('2026-08-17');
    expect(effectiveBoardDay(fn, '2026-08-16')).toBe('2026-08-17');
  });

  it('before the fortnight starts, resolves to the first day', () => {
    expect(effectiveBoardDay(fn, '2026-08-07')).toBe('2026-08-10');
  });

  it('after the last day, returns null (expired)', () => {
    expect(effectiveBoardDay(fn, '2026-08-22')).toBeNull();
    expect(effectiveBoardDay(fn, '2026-08-24')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./fortnight` not found).

- [ ] **Step 3: Implement `src/domain/fortnight.ts`**

```ts
import type { Fortnight, ISODate } from './types';
import { addDays, mondayOfWeek, nextWorkday } from './dates';

export function generateFortnightDays(anchor: ISODate): ISODate[] {
  const monday = mondayOfWeek(anchor);
  const days: ISODate[] = [];
  for (const weekStart of [monday, addDays(monday, 7)]) {
    for (let i = 0; i < 5; i++) days.push(addDays(weekStart, i));
  }
  return days;
}

export function effectiveBoardDay(fortnight: Fortnight, today: ISODate): ISODate | null {
  const first = fortnight.days[0];
  const last = fortnight.days[fortnight.days.length - 1];
  if (today > last) return null;
  if (today < first) return first;
  if (fortnight.days.includes(today)) return today;
  const next = nextWorkday(today); // weekend mid-fortnight
  return next <= last ? next : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/fortnight.ts src/domain/fortnight.test.ts
git commit -m "feat: fortnight generation and effective board day"
```

---

### Task 4: Daily rollover

**Files:**
- Create: `src/domain/rollover.ts`
- Test: `src/domain/rollover.test.ts`

**Interfaces:**
- Consumes: `effectiveBoardDay` (Task 3), `Todo`/`Fortnight` types.
- Produces: `applyRollover(todos: Record<string, Todo>, fortnight: Fortnight, today: ISODate): { todos: Record<string, Todo>; changed: boolean }`

- [ ] **Step 1: Write failing tests `src/domain/rollover.test.ts`**

```ts
import { applyRollover } from './rollover';
import { generateFortnightDays } from './fortnight';
import type { Fortnight, Todo } from './types';

const fn: Fortnight = {
  id: 'f1', startDay: '2026-08-10',
  days: generateFortnightDays('2026-08-10'),
  createdAt: '2026-08-10T12:00:00.000Z',
};

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-10', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('applyRollover', () => {
  it('moves past incomplete todos to today and flags them', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-10' }) };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.changed).toBe(true);
    expect(res.todos.a.scheduledDay).toBe('2026-08-12');
    expect(res.todos.a.rolledOver).toBe(true);
  });

  it('leaves done, today, and future todos untouched', () => {
    const todos = {
      done: makeTodo({ id: 'done', scheduledDay: '2026-08-10', done: true }),
      today: makeTodo({ id: 'today', scheduledDay: '2026-08-12' }),
      future: makeTodo({ id: 'future', scheduledDay: '2026-08-20' }),
    };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.changed).toBe(false);
    expect(res.todos).toEqual(todos);
  });

  it('ignores todos from other fortnights', () => {
    const todos = { x: makeTodo({ id: 'x', fortnightId: 'OLD', scheduledDay: '2026-08-10' }) };
    expect(applyRollover(todos, fn, '2026-08-12').changed).toBe(false);
  });

  it('on a weekend, rolls to the upcoming Monday', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-13' }) };
    const res = applyRollover(todos, fn, '2026-08-15'); // Saturday
    expect(res.todos.a.scheduledDay).toBe('2026-08-17');
  });

  it('no-ops when the fortnight is expired', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-13' }) };
    const res = applyRollover(todos, fn, '2026-08-24');
    expect(res.changed).toBe(false);
    expect(res.todos.a.scheduledDay).toBe('2026-08-13');
  });

  it('preserves createdAt and reminderAt', () => {
    const todos = { a: makeTodo({ id: 'a', reminderAt: '2026-08-10T09:00' }) };
    const res = applyRollover(todos, fn, '2026-08-12');
    expect(res.todos.a.createdAt).toBe('2026-08-10T09:00:00.000Z');
    expect(res.todos.a.reminderAt).toBe('2026-08-10T09:00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./rollover` not found).

- [ ] **Step 3: Implement `src/domain/rollover.ts`**

```ts
import type { Fortnight, ISODate, Todo } from './types';
import { effectiveBoardDay } from './fortnight';

export function applyRollover(
  todos: Record<string, Todo>,
  fortnight: Fortnight,
  today: ISODate,
): { todos: Record<string, Todo>; changed: boolean } {
  const target = effectiveBoardDay(fortnight, today);
  if (target === null) return { todos, changed: false };
  let changed = false;
  const out: Record<string, Todo> = { ...todos };
  for (const t of Object.values(todos)) {
    if (t.fortnightId !== fortnight.id || t.done || t.scheduledDay >= today) continue;
    out[t.id] = { ...t, scheduledDay: target, rolledOver: true };
    changed = true;
  }
  return { todos: out, changed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rollover.ts src/domain/rollover.test.ts
git commit -m "feat: daily rollover of incomplete todos"
```

---

### Task 5: Carry-over at fortnight regeneration

**Files:**
- Modify: `src/domain/fortnight.ts` (add `carryOverTodos`)
- Test: `src/domain/carryOver.test.ts`

**Interfaces:**
- Consumes: `effectiveBoardDay`, `Todo`/`Fortnight` types.
- Produces: `carryOverTodos(todos: Record<string, Todo>, oldFortnightId: string, newFortnight: Fortnight, today: ISODate): Record<string, Todo>`

- [ ] **Step 1: Write failing tests `src/domain/carryOver.test.ts`**

Scenario: old fortnight f1 = weeks of Aug 10 + Aug 17. Regenerate on Wed 2026-08-19 → new fortnight f2 = weeks of Aug 17 + Aug 24 (overlap: Aug 17–21).

```ts
import { carryOverTodos, generateFortnightDays } from './fortnight';
import type { Fortnight, Todo } from './types';

const f2: Fortnight = {
  id: 'f2', startDay: '2026-08-17',
  days: generateFortnightDays('2026-08-19'),
  createdAt: '2026-08-19T12:00:00.000Z',
};

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-17', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('carryOverTodos (regenerating on 2026-08-19)', () => {
  it('moves incomplete past todos to the new effective day, flagged rolledOver', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-11' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'f2', scheduledDay: '2026-08-19', rolledOver: true });
  });

  it('keeps overlapping future days: only the fortnightId changes', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-20' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a).toMatchObject({ fortnightId: 'f2', scheduledDay: '2026-08-20', rolledOver: false });
  });

  it('leaves done todos in the old fortnight (history)', () => {
    const todos = { a: makeTodo({ id: 'a', done: true, completedAt: '2026-08-17T15:00:00.000Z' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a.fortnightId).toBe('f1');
  });

  it('preserves createdAt and reminderAt across the move', () => {
    const todos = { a: makeTodo({ id: 'a', scheduledDay: '2026-08-11', reminderAt: '2026-08-11T09:00' }) };
    const res = carryOverTodos(todos, 'f1', f2, '2026-08-19');
    expect(res.a.createdAt).toBe('2026-08-10T09:00:00.000Z');
    expect(res.a.reminderAt).toBe('2026-08-11T09:00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (`carryOverTodos` is not exported).

- [ ] **Step 3: Add `carryOverTodos` to `src/domain/fortnight.ts`**

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
    }
  }
  return out;
}
```

(Add `Todo` to the type imports in `fortnight.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/fortnight.ts src/domain/carryOver.test.ts
git commit -m "feat: carry over incomplete todos on fortnight regeneration"
```

---

### Task 6: Standup builder + text formatter

**Files:**
- Create: `src/domain/standup.ts`
- Test: `src/domain/standup.test.ts`

**Interfaces:**
- Consumes: `isWorkday`, `nextWorkday`, `previousWorkday`, `localDateOf` (Task 2); `Todo`/`Note` types.
- Produces:
  - `interface StandupData { effectiveDay: ISODate; yesterday: Todo[]; today: Todo[]; blockers: Note[] }`
  - `buildStandup(todos: Record<string, Todo>, notes: Record<string, Note>, activeFortnightId: string, today: ISODate): StandupData`
  - `formatStandup(data: StandupData): string`

- [ ] **Step 1: Write failing tests `src/domain/standup.test.ts`**

```ts
import { buildStandup, formatStandup } from './standup';
import type { Note, Todo } from './types';

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: over.title ?? 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}
function makeNote(over: Partial<Note>): Note {
  return {
    id: over.id ?? 'n1', fortnightId: 'f1', day: '2026-08-17', category: 'blocker',
    text: over.text ?? 'blocked', resolved: false, createdAt: '2026-08-17T09:00:00.000Z', ...over,
  };
}
// completedAt helper: local wall-clock time on a given day
const doneAt = (y: number, mo: number, d: number) => new Date(y, mo - 1, d, 15, 0).toISOString();

describe('buildStandup', () => {
  it('on Tuesday: yesterday = Monday completions only', () => {
    const todos = {
      mon: makeTodo({ id: 'mon', done: true, completedAt: doneAt(2026, 8, 17) }),
      fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-18');
    expect(s.yesterday.map((t) => t.id)).toEqual(['mon']);
  });

  it('on Monday: yesterday = Friday plus weekend completions', () => {
    const todos = {
      fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }),
      sat: makeTodo({ id: 'sat', done: true, completedAt: doneAt(2026, 8, 15) }),
      thu: makeTodo({ id: 'thu', done: true, completedAt: doneAt(2026, 8, 13) }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-17');
    expect(s.yesterday.map((t) => t.id).sort()).toEqual(['fri', 'sat']);
  });

  it('on Saturday: effective day is Monday, yesterday is Friday', () => {
    const todos = { fri: makeTodo({ id: 'fri', done: true, completedAt: doneAt(2026, 8, 14) }) };
    const s = buildStandup(todos, {}, 'f1', '2026-08-15');
    expect(s.effectiveDay).toBe('2026-08-17');
    expect(s.yesterday.map((t) => t.id)).toEqual(['fri']);
  });

  it('today = todos scheduled on the effective day', () => {
    const todos = {
      a: makeTodo({ id: 'a', scheduledDay: '2026-08-18' }),
      b: makeTodo({ id: 'b', scheduledDay: '2026-08-19' }),
    };
    const s = buildStandup(todos, {}, 'f1', '2026-08-18');
    expect(s.today.map((t) => t.id)).toEqual(['a']);
  });

  it('blockers = unresolved blocker notes of the active fortnight only', () => {
    const notes = {
      open: makeNote({ id: 'open' }),
      resolved: makeNote({ id: 'resolved', resolved: true }),
      info: makeNote({ id: 'info', category: 'info' }),
      old: makeNote({ id: 'old', fortnightId: 'OLD' }),
    };
    const s = buildStandup({}, notes, 'f1', '2026-08-18');
    expect(s.blockers.map((n) => n.id)).toEqual(['open']);
  });
});

describe('formatStandup', () => {
  it('formats sections with bullets and None for empty sections', () => {
    const s = buildStandup(
      { a: makeTodo({ id: 'a', title: 'Ship feature', done: true, completedAt: doneAt(2026, 8, 17) }) },
      {},
      'f1',
      '2026-08-18',
    );
    expect(formatStandup(s)).toBe(
      '*Yesterday*\n- Ship feature\n\n*Today*\n- None\n\n*Blockers*\n- None',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./standup` not found).

- [ ] **Step 3: Implement `src/domain/standup.ts`**

```ts
import type { ISODate, Note, Todo } from './types';
import { isWorkday, localDateOf, nextWorkday, previousWorkday } from './dates';

export interface StandupData {
  effectiveDay: ISODate;
  yesterday: Todo[];
  today: Todo[];
  blockers: Note[];
}

export function buildStandup(
  todos: Record<string, Todo>,
  notes: Record<string, Note>,
  activeFortnightId: string,
  today: ISODate,
): StandupData {
  const effectiveDay = isWorkday(today) ? today : nextWorkday(today);
  const prev = previousWorkday(effectiveDay);
  const all = Object.values(todos);

  const yesterday = all
    .filter((t) => t.done && t.completedAt !== undefined)
    .filter((t) => {
      const d = localDateOf(t.completedAt!);
      return d >= prev && d < effectiveDay; // half-open range: Monday sees Fri+Sat+Sun
    })
    .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!));

  const todayTodos = all
    .filter((t) => t.fortnightId === activeFortnightId && t.scheduledDay === effectiveDay)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const blockers = Object.values(notes)
    .filter((n) => n.fortnightId === activeFortnightId && n.category === 'blocker' && !n.resolved)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { effectiveDay, yesterday, today: todayTodos, blockers };
}

export function formatStandup(data: StandupData): string {
  const section = (title: string, lines: string[]): string =>
    [`*${title}*`, ...(lines.length ? lines.map((l) => `- ${l}`) : ['- None'])].join('\n');
  return [
    section('Yesterday', data.yesterday.map((t) => t.title)),
    section('Today', data.today.map((t) => t.title)),
    section('Blockers', data.blockers.map((n) => n.text)),
  ].join('\n\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/standup.ts src/domain/standup.test.ts
git commit -m "feat: standup builder and clipboard text formatter"
```

---

### Task 7: Reminders partition

**Files:**
- Create: `src/domain/reminders.ts`
- Test: `src/domain/reminders.test.ts`

**Interfaces:**
- Consumes: `Todo` type.
- Produces: `partitionReminders(todos: Record<string, Todo>, now: Date): { overdue: Todo[]; upcoming: Todo[] }`

- [ ] **Step 1: Write failing tests `src/domain/reminders.test.ts`**

```ts
import { partitionReminders } from './reminders';
import type { Todo } from './types';

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: over.id ?? 't1', fortnightId: 'f1', title: 'task', priority: 'medium',
    scheduledDay: '2026-08-18', done: false, createdAt: '2026-08-10T09:00:00.000Z',
    rolledOver: false, ...over,
  };
}

describe('partitionReminders', () => {
  const now = new Date(2026, 7, 18, 12, 0); // Aug 18, 12:00 local

  it('splits into overdue (<= now) and upcoming (> now), sorted by time', () => {
    const todos = {
      late2: makeTodo({ id: 'late2', reminderAt: '2026-08-18T11:00' }),
      late1: makeTodo({ id: 'late1', reminderAt: '2026-08-17T09:00' }),
      soon: makeTodo({ id: 'soon', reminderAt: '2026-08-18T15:00' }),
    };
    const res = partitionReminders(todos, now);
    expect(res.overdue.map((t) => t.id)).toEqual(['late1', 'late2']);
    expect(res.upcoming.map((t) => t.id)).toEqual(['soon']);
  });

  it('excludes done todos and todos without reminders', () => {
    const todos = {
      done: makeTodo({ id: 'done', done: true, reminderAt: '2026-08-17T09:00' }),
      plain: makeTodo({ id: 'plain' }),
    };
    const res = partitionReminders(todos, now);
    expect(res.overdue).toEqual([]);
    expect(res.upcoming).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./reminders` not found).

- [ ] **Step 3: Implement `src/domain/reminders.ts`**

```ts
import type { Todo } from './types';

export function partitionReminders(
  todos: Record<string, Todo>,
  now: Date,
): { overdue: Todo[]; upcoming: Todo[] } {
  const withReminder = Object.values(todos)
    .filter((t) => !t.done && t.reminderAt !== undefined)
    .sort((a, b) => a.reminderAt!.localeCompare(b.reminderAt!));
  return {
    overdue: withReminder.filter((t) => new Date(t.reminderAt!) <= now),
    upcoming: withReminder.filter((t) => new Date(t.reminderAt!) > now),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reminders.ts src/domain/reminders.test.ts
git commit -m "feat: reminder partition into overdue and upcoming"
```

---

### Task 8: Schema migrations

**Files:**
- Create: `src/store/migrations.ts`
- Test: `src/store/migrations.test.ts`

**Interfaces:**
- Consumes: `PersistedState` type.
- Produces:
  - `SCHEMA_VERSION = 1`
  - `class UnsupportedSchemaError extends Error`
  - `runMigrations(state: unknown, fromVersion: number, steps?: Record<number, (s: unknown) => unknown>): PersistedState` — applies `steps[v]` for `v = fromVersion .. SCHEMA_VERSION-1`; throws `UnsupportedSchemaError` if `fromVersion > SCHEMA_VERSION` or a step is missing.

- [ ] **Step 1: Write failing tests `src/store/migrations.test.ts`**

```ts
import { runMigrations, SCHEMA_VERSION, UnsupportedSchemaError } from './migrations';
import type { PersistedState } from '../domain/types';

const current: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
};

describe('runMigrations', () => {
  it('is identity at the current version', () => {
    expect(runMigrations(current, SCHEMA_VERSION)).toEqual(current);
  });

  it('applies migration steps in sequence', () => {
    const v0 = { fortnights: [], activeFortnightId: null, todos: {}, notes: {} };
    const steps = { 0: (s: unknown) => ({ ...(s as object), lastRolloverDay: null }) };
    const res = runMigrations(v0, 0, steps);
    expect(res.lastRolloverDay).toBeNull();
    expect(res.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects newer-than-supported versions', () => {
    expect(() => runMigrations(current, SCHEMA_VERSION + 1)).toThrow(UnsupportedSchemaError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./migrations` not found).

- [ ] **Step 3: Implement `src/store/migrations.ts`**

```ts
import type { PersistedState } from '../domain/types';

export const SCHEMA_VERSION = 1;

export class UnsupportedSchemaError extends Error {}

// Add an entry per schema bump, e.g. { 1: (s) => ({ ...s, newField: default }) }
const defaultSteps: Record<number, (s: unknown) => unknown> = {};

export function runMigrations(
  state: unknown,
  fromVersion: number,
  steps: Record<number, (s: unknown) => unknown> = defaultSteps,
): PersistedState {
  if (fromVersion > SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(
      `Backup uses schema v${fromVersion}, but this app supports up to v${SCHEMA_VERSION}. Update the app first.`,
    );
  }
  let s = state;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = steps[v];
    if (!step) throw new UnsupportedSchemaError(`No migration defined from schema v${v}`);
    s = step(s);
  }
  return { ...(s as PersistedState), schemaVersion: SCHEMA_VERSION };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/migrations.ts src/store/migrations.test.ts
git commit -m "feat: versioned schema migrations"
```

---

### Task 9: Debounced localStorage adapter

**Files:**
- Create: `src/store/persistence.ts`
- Test: `src/store/persistence.test.ts`

**Interfaces:**
- Consumes: nothing (wraps `localStorage`).
- Produces: `createDebouncedStorage(delayMs?: number): StateStorage & { flush: () => void }` — Zustand `StateStorage` (sync `getItem`/`setItem`/`removeItem`) that batches writes with a 300 ms trailing debounce; `flush()` writes synchronously (used on `pagehide`/`beforeunload`). `getItem` must return a pending unwritten value if one exists.

- [ ] **Step 1: Write failing tests `src/store/persistence.test.ts`**

```ts
import { createDebouncedStorage } from './persistence';

describe('createDebouncedStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces rapid writes into a single localStorage write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'v1');
    storage.setItem('k', 'v2');
    storage.setItem('k', 'v3');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('k')).toBe('v3');
  });

  it('getItem returns the pending value before the write lands', () => {
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'pending');
    expect(storage.getItem('k')).toBe('pending');
  });

  it('flush writes immediately', () => {
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'v');
    storage.flush();
    expect(localStorage.getItem('k')).toBe('v');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./persistence` not found).

- [ ] **Step 3: Implement `src/store/persistence.ts`**

```ts
import type { StateStorage } from 'zustand/middleware';

export function createDebouncedStorage(delayMs = 300): StateStorage & { flush: () => void } {
  let pending: { key: string; value: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) { localStorage.setItem(pending.key, pending.value); pending = null; }
  };

  return {
    getItem: (key) => (pending?.key === key ? pending.value : localStorage.getItem(key)),
    setItem: (key, value) => {
      pending = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    removeItem: (key) => {
      if (pending?.key === key) pending = null;
      localStorage.removeItem(key);
    },
    flush: write,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/persistence.ts src/store/persistence.test.ts
git commit -m "feat: debounced localStorage adapter with sync flush"
```

---

### Task 10: Backup export/import (validation + serialization)

**Files:**
- Create: `src/store/exportImport.ts`
- Test: `src/store/exportImport.test.ts`

**Interfaces:**
- Consumes: `runMigrations`, `SCHEMA_VERSION`, `UnsupportedSchemaError` (Task 8); `PersistedState` type.
- Produces:
  - `validatePersistedState(value: unknown): value is PersistedState` — structural check (objects, arrays, required keys).
  - `serializeState(state: PersistedState): string` — pretty-printed JSON.
  - `parseBackup(json: string): PersistedState` — parse → migrate (if older) → validate; throws `Error` with a readable message on any failure.

- [ ] **Step 1: Write failing tests `src/store/exportImport.test.ts`**

```ts
import { parseBackup, serializeState, validatePersistedState } from './exportImport';
import { SCHEMA_VERSION } from './migrations';
import type { PersistedState } from '../domain/types';

const good: PersistedState = {
  schemaVersion: SCHEMA_VERSION, fortnights: [], activeFortnightId: null,
  todos: {}, notes: {}, lastRolloverDay: null,
};

describe('backup export/import', () => {
  it('round-trips serialize -> parseBackup', () => {
    expect(parseBackup(serializeState(good))).toEqual(good);
  });

  it('validatePersistedState accepts a good document and rejects garbage', () => {
    expect(validatePersistedState(good)).toBe(true);
    expect(validatePersistedState(null)).toBe(false);
    expect(validatePersistedState({ schemaVersion: 1 })).toBe(false);
    expect(validatePersistedState({ ...good, todos: 'nope' })).toBe(false);
  });

  it('rejects invalid JSON with a readable error', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/i);
  });

  it('rejects newer schema versions with a readable error', () => {
    const newer = JSON.stringify({ ...good, schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => parseBackup(newer)).toThrow(/newer|supports up to/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./exportImport` not found).

- [ ] **Step 3: Implement `src/store/exportImport.ts`**

```ts
import type { PersistedState } from '../domain/types';
import { runMigrations } from './migrations';

export function validatePersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === 'number' &&
    Array.isArray(v.fortnights) &&
    (v.activeFortnightId === null || typeof v.activeFortnightId === 'string') &&
    typeof v.todos === 'object' && v.todos !== null && !Array.isArray(v.todos) &&
    typeof v.notes === 'object' && v.notes !== null && !Array.isArray(v.notes) &&
    (v.lastRolloverDay === null || typeof v.lastRolloverDay === 'string')
  );
}

export function serializeState(state: PersistedState): string {
  return JSON.stringify(state, null, 2);
}

export function parseBackup(json: string): PersistedState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null || typeof (raw as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    throw new Error('The selected file is not an Agile Todo backup.');
  }
  const migrated = runMigrations(raw, (raw as { schemaVersion: number }).schemaVersion);
  if (!validatePersistedState(migrated)) {
    throw new Error('The backup file is malformed and cannot be imported.');
  }
  return migrated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/exportImport.ts src/store/exportImport.test.ts
git commit -m "feat: backup serialization, validation and import parsing"
```

---

### Task 11: Clock, store creation, init and CRUD actions

**Files:**
- Create: `src/store/clock.ts`, `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces:
  - `clock.ts`: `todayLocal(): ISODate` (= `toISODate(new Date())`), `nowIso(): ISODateTime` (= `new Date().toISOString()`). **The only ambient-time readers in the app.** Tests mock this module with `vi.mock`.
  - `store.ts`: `useAppStore` (Zustand). State = `PersistedState` fields + `viewedFortnightId: string | null`, `selectedDay: ISODate | null`. Actions:
    - `initApp(): void`
    - `addTodo(input: { title: string; description?: string; priority: Priority; scheduledDay: ISODate; reminderAt?: LocalDateTime }): void`
    - `updateTodo(id: string, patch: Partial<Pick<Todo, 'title' | 'description' | 'priority' | 'reminderAt'>>): void`
    - `rescheduleTodo(id: string, day: ISODate): void` (clears `rolledOver`)
    - `toggleDone(id: string): void` (sets/clears `completedAt` via `nowIso()`)
    - `deleteTodo(id: string): void`
    - `addNote(input: { day: ISODate; category: NoteCategory; text: string }): void`
    - `updateNote(id: string, patch: Partial<Pick<Note, 'text' | 'category'>>): void`
    - `resolveBlocker(id: string): void`, `deleteNote(id: string): void`
    - `selectDay(day: ISODate): void`, `viewFortnight(id: string): void`
    - (Task 12 adds `checkDayTick`, `regenerateFortnight`)

- [ ] **Step 1: Write failing tests `src/store/store.test.ts`**

```ts
import { useAppStore } from './store';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

function reset() {
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
}

describe('store', () => {
  beforeEach(reset);

  it('initApp creates a fortnight anchored to today when none exists', () => {
    useAppStore.getState().initApp();
    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(1);
    expect(s.fortnights[0].days[0]).toBe('2026-08-17'); // Monday of 2026-08-18's week
    expect(s.activeFortnightId).toBe(s.fortnights[0].id);
    expect(s.viewedFortnightId).toBe(s.fortnights[0].id);
    expect(s.selectedDay).toBe('2026-08-18');
    expect(s.lastRolloverDay).toBe('2026-08-18');
  });

  it('addTodo / toggleDone / rescheduleTodo / deleteTodo', () => {
    const store = useAppStore.getState();
    store.initApp();
    store.addTodo({ title: 'Write spec', priority: 'high', scheduledDay: '2026-08-18' });
    let todo = Object.values(useAppStore.getState().todos)[0];
    expect(todo).toMatchObject({ title: 'Write spec', priority: 'high', done: false, rolledOver: false });

    useAppStore.getState().toggleDone(todo.id);
    todo = useAppStore.getState().todos[todo.id];
    expect(todo.done).toBe(true);
    expect(todo.completedAt).toBe('2026-08-18T12:00:00.000Z');

    useAppStore.getState().toggleDone(todo.id);
    expect(useAppStore.getState().todos[todo.id].completedAt).toBeUndefined();

    useAppStore.getState().rescheduleTodo(todo.id, '2026-08-20');
    todo = useAppStore.getState().todos[todo.id];
    expect(todo.scheduledDay).toBe('2026-08-20');
    expect(todo.rolledOver).toBe(false);

    useAppStore.getState().deleteTodo(todo.id);
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('note CRUD and resolveBlocker', () => {
    const store = useAppStore.getState();
    store.initApp();
    store.addNote({ day: '2026-08-18', category: 'blocker', text: 'Waiting on API keys' });
    const note = Object.values(useAppStore.getState().notes)[0];
    expect(note).toMatchObject({ category: 'blocker', resolved: false });

    useAppStore.getState().resolveBlocker(note.id);
    expect(useAppStore.getState().notes[note.id].resolved).toBe(true);

    useAppStore.getState().deleteNote(note.id);
    expect(useAppStore.getState().notes).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (module `./store` not found).

- [ ] **Step 3: Implement `src/store/clock.ts` and `src/store/store.ts`**

`src/store/clock.ts`:

```ts
import type { ISODate, ISODateTime } from '../domain/types';
import { toISODate } from '../domain/dates';

export function todayLocal(): ISODate {
  return toISODate(new Date());
}

export function nowIso(): ISODateTime {
  return new Date().toISOString();
}
```

`src/store/store.ts` (persistence middleware is wired in Task 13; keep `create` plain for now):

```ts
import { create } from 'zustand';
import type {
  Fortnight, ISODate, LocalDateTime, Note, NoteCategory, PersistedState, Priority, Todo,
} from '../domain/types';
import { generateFortnightDays, effectiveBoardDay, carryOverTodos } from '../domain/fortnight';
import { applyRollover } from '../domain/rollover';
import { nowIso, todayLocal } from './clock';
import { SCHEMA_VERSION } from './migrations';

export interface AppState extends PersistedState {
  viewedFortnightId: string | null;
  selectedDay: ISODate | null;

  initApp: () => void;
  checkDayTick: () => void;          // implemented in Task 12
  regenerateFortnight: () => void;   // implemented in Task 12
  addTodo: (input: {
    title: string; description?: string; priority: Priority;
    scheduledDay: ISODate; reminderAt?: LocalDateTime;
  }) => void;
  updateTodo: (id: string, patch: Partial<Pick<Todo, 'title' | 'description' | 'priority' | 'reminderAt'>>) => void;
  rescheduleTodo: (id: string, day: ISODate) => void;
  toggleDone: (id: string) => void;
  deleteTodo: (id: string) => void;
  addNote: (input: { day: ISODate; category: NoteCategory; text: string }) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, 'text' | 'category'>>) => void;
  resolveBlocker: (id: string) => void;
  deleteNote: (id: string) => void;
  selectDay: (day: ISODate) => void;
  viewFortnight: (id: string) => void;
}

function buildFortnight(anchor: ISODate): Fortnight {
  const days = generateFortnightDays(anchor);
  return { id: crypto.randomUUID(), startDay: days[0], days, createdAt: nowIso() };
}

export const useAppStore = create<AppState>()((set, get) => ({
  schemaVersion: SCHEMA_VERSION,
  fortnights: [],
  activeFortnightId: null,
  todos: {},
  notes: {},
  lastRolloverDay: null,
  viewedFortnightId: null,
  selectedDay: null,

  initApp: () => {
    const today = todayLocal();
    if (!get().activeFortnightId) {
      const fn = buildFortnight(today);
      set({
        fortnights: [fn],
        activeFortnightId: fn.id,
        viewedFortnightId: fn.id,
        selectedDay: effectiveBoardDay(fn, today),
        lastRolloverDay: today,
      });
    } else {
      get().checkDayTick();
      const s = get();
      const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
      set({
        viewedFortnightId: active.id,
        selectedDay: s.selectedDay ?? effectiveBoardDay(active, today) ?? active.days[0],
      });
    }
  },

  checkDayTick: () => { /* Task 12 */ },
  regenerateFortnight: () => { /* Task 12 */ },

  addTodo: (input) => {
    const id = crypto.randomUUID();
    const todo: Todo = {
      id,
      fortnightId: get().activeFortnightId!,
      title: input.title,
      description: input.description,
      priority: input.priority,
      scheduledDay: input.scheduledDay,
      done: false,
      createdAt: nowIso(),
      rolledOver: false,
      reminderAt: input.reminderAt,
    };
    set((s) => ({ todos: { ...s.todos, [id]: todo } }));
  },

  updateTodo: (id, patch) =>
    set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], ...patch } } })),

  rescheduleTodo: (id, day) =>
    set((s) => ({ todos: { ...s.todos, [id]: { ...s.todos[id], scheduledDay: day, rolledOver: false } } })),

  toggleDone: (id) =>
    set((s) => {
      const t = s.todos[id];
      const done = !t.done;
      return { todos: { ...s.todos, [id]: { ...t, done, completedAt: done ? nowIso() : undefined } } };
    }),

  deleteTodo: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.todos;
      return { todos: rest };
    }),

  addNote: (input) => {
    const id = crypto.randomUUID();
    const note: Note = {
      id,
      fortnightId: get().activeFortnightId!,
      day: input.day,
      category: input.category,
      text: input.text,
      resolved: false,
      createdAt: nowIso(),
    };
    set((s) => ({ notes: { ...s.notes, [id]: note } }));
  },

  updateNote: (id, patch) =>
    set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], ...patch } } })),

  resolveBlocker: (id) =>
    set((s) => ({ notes: { ...s.notes, [id]: { ...s.notes[id], resolved: true } } })),

  deleteNote: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.notes;
      return { notes: rest };
    }),

  selectDay: (day) => set({ selectedDay: day }),
  viewFortnight: (id) =>
    set((s) => {
      const fn = s.fortnights.find((f) => f.id === id)!;
      const today = todayLocal();
      return {
        viewedFortnightId: id,
        selectedDay:
          id === s.activeFortnightId ? effectiveBoardDay(fn, today) ?? fn.days[0] : fn.days[0],
      };
    }),
}));
```

Note: `carryOverTodos` and `applyRollover` imports are used in Task 12 — if the linter complains about unused imports, add them in Task 12 instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/clock.ts src/store/store.ts src/store/store.test.ts
git commit -m "feat: zustand store with init and todo/note CRUD actions"
```

---

### Task 12: checkDayTick, regenerateFortnight and selectors

**Files:**
- Modify: `src/store/store.ts` (fill in the two stubbed actions)
- Create: `src/store/selectors.ts`
- Test: `src/store/dayTick.test.ts`, `src/store/selectors.test.ts`

**Interfaces:**
- Consumes: `applyRollover` (Task 4), `carryOverTodos` (Task 5), `effectiveBoardDay`, `clock`.
- Produces:
  - `checkDayTick(): void` — idempotent per calendar day: if `todayLocal() !== lastRolloverDay`, runs `applyRollover` on the active fortnight, stamps `lastRolloverDay`, resets `selectedDay` to the effective board day (when viewing the active fortnight).
  - `regenerateFortnight(): void` — builds a fortnight anchored to today, runs `carryOverTodos`, appends it, makes it active + viewed, stamps `lastRolloverDay`.
  - `selectors.ts`:
    - `selectViewedFortnight(s: AppState): Fortnight | null`
    - `selectIsReadOnly(s: AppState): boolean` — `viewedFortnightId !== activeFortnightId`
    - `selectTodosForDay(s: AppState, fortnightId: string, day: ISODate): Todo[]` (sorted: not-done first, then priority high→low, then createdAt)
    - `selectNotesForDay(s: AppState, fortnightId: string, day: ISODate): Note[]`
    - `selectFortnightExpired(s: AppState): boolean` — active fortnight and `effectiveBoardDay === null`

- [ ] **Step 1: Write failing tests**

`src/store/dayTick.test.ts`:

```ts
import { useAppStore } from './store';

const clock = { today: '2026-08-18' };
vi.mock('./clock', () => ({
  todayLocal: () => clock.today,
  nowIso: () => `${clock.today}T12:00:00.000Z`,
}));

function reset() {
  clock.today = '2026-08-18';
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
  useAppStore.getState().initApp();
}

describe('checkDayTick', () => {
  beforeEach(reset);

  it('rolls incomplete todos forward exactly once per day change', () => {
    useAppStore.getState().addTodo({ title: 'a', priority: 'low', scheduledDay: '2026-08-18' });
    clock.today = '2026-08-19';
    useAppStore.getState().checkDayTick();
    const afterFirst = Object.values(useAppStore.getState().todos)[0];
    expect(afterFirst).toMatchObject({ scheduledDay: '2026-08-19', rolledOver: true });
    expect(useAppStore.getState().lastRolloverDay).toBe('2026-08-19');
    expect(useAppStore.getState().selectedDay).toBe('2026-08-19');

    useAppStore.getState().checkDayTick(); // same day again: no-op
    expect(Object.values(useAppStore.getState().todos)[0]).toEqual(afterFirst);
  });
});

describe('regenerateFortnight', () => {
  beforeEach(reset);

  it('appends a new active fortnight and carries incomplete todos over', () => {
    useAppStore.getState().addTodo({ title: 'pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'shipped', priority: 'low', scheduledDay: '2026-08-18' });
    const shipped = Object.values(useAppStore.getState().todos).find((t) => t.title === 'shipped')!;
    useAppStore.getState().toggleDone(shipped.id);

    clock.today = '2026-08-25'; // fortnight (Aug 17-28 workdays) still active; regenerate mid-flight
    const oldId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();

    const s = useAppStore.getState();
    expect(s.fortnights).toHaveLength(2);
    expect(s.activeFortnightId).not.toBe(oldId);
    expect(s.viewedFortnightId).toBe(s.activeFortnightId);
    const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
    expect(pending.fortnightId).toBe(s.activeFortnightId);
    expect(pending.scheduledDay).toBe('2026-08-25');
    expect(Object.values(s.todos).find((t) => t.title === 'shipped')!.fortnightId).toBe(oldId);
  });
});
```

`src/store/selectors.test.ts`:

```ts
import { useAppStore } from './store';
import {
  selectIsReadOnly, selectTodosForDay, selectViewedFortnight,
} from './selectors';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('selectors', () => {
  beforeEach(() => {
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
      viewedFortnightId: null, selectedDay: null,
    });
    useAppStore.getState().initApp();
  });

  it('selectIsReadOnly is false on the active fortnight', () => {
    expect(selectIsReadOnly(useAppStore.getState())).toBe(false);
  });

  it('selectTodosForDay sorts not-done first, then priority high->low', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'low', priority: 'low', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'high', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'done-high', priority: 'high', scheduledDay: '2026-08-18' });
    const doneOne = Object.values(useAppStore.getState().todos).find((t) => t.title === 'done-high')!;
    useAppStore.getState().toggleDone(doneOne.id);

    const s = useAppStore.getState();
    const fn = selectViewedFortnight(s)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['high', 'low', 'done-high']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (rollover not applied / module `./selectors` not found).

- [ ] **Step 3: Implement**

Replace the two stubs in `src/store/store.ts`:

```ts
  checkDayTick: () => {
    const today = todayLocal();
    const s = get();
    if (s.lastRolloverDay === today || !s.activeFortnightId) return;
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const { todos } = applyRollover(s.todos, active, today);
    const effective = effectiveBoardDay(active, today);
    set({
      todos,
      lastRolloverDay: today,
      selectedDay:
        s.viewedFortnightId === s.activeFortnightId && effective !== null
          ? effective
          : s.selectedDay,
    });
  },

  regenerateFortnight: () => {
    const today = todayLocal();
    const s = get();
    const oldId = s.activeFortnightId;
    const fn = buildFortnight(today);
    const todos = oldId ? carryOverTodos(s.todos, oldId, fn, today) : s.todos;
    set({
      fortnights: [...s.fortnights, fn],
      activeFortnightId: fn.id,
      viewedFortnightId: fn.id,
      todos,
      selectedDay: effectiveBoardDay(fn, today),
      lastRolloverDay: today,
    });
  },
```

Create `src/store/selectors.ts`:

```ts
import type { Fortnight, ISODate, Note, Todo } from '../domain/types';
import { effectiveBoardDay } from '../domain/fortnight';
import { todayLocal } from './clock';
import type { AppState } from './store';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function selectViewedFortnight(s: AppState): Fortnight | null {
  return s.fortnights.find((f) => f.id === s.viewedFortnightId) ?? null;
}

export function selectIsReadOnly(s: AppState): boolean {
  return s.viewedFortnightId !== s.activeFortnightId;
}

export function selectTodosForDay(s: AppState, fortnightId: string, day: ISODate): Todo[] {
  return Object.values(s.todos)
    .filter((t) => t.fortnightId === fortnightId && t.scheduledDay === day)
    .sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.createdAt.localeCompare(b.createdAt),
    );
}

export function selectNotesForDay(s: AppState, fortnightId: string, day: ISODate): Note[] {
  return Object.values(s.notes)
    .filter((n) => n.fortnightId === fortnightId && n.day === day)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function selectFortnightExpired(s: AppState): boolean {
  const active = s.fortnights.find((f) => f.id === s.activeFortnightId);
  return active !== undefined && effectiveBoardDay(active, todayLocal()) === null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: day-tick rollover, fortnight regeneration and board selectors"
```

---

### Task 13: Wire persistence into the store

**Files:**
- Modify: `src/store/store.ts` (wrap `create` with `persist`)
- Test: `src/store/storePersistence.test.ts`

**Interfaces:**
- Consumes: `createDebouncedStorage` (Task 9), `runMigrations`/`SCHEMA_VERSION` (Task 8).
- Produces: the store persists `PersistedState` fields (and ONLY those) under key `agile-todo-app.v-state`; exported `appStorage` (the debounced storage instance) so `main.tsx` can register `flush` on `pagehide`; exported `importState(state: PersistedState): void` action that replaces persisted fields and re-derives view state.

- [ ] **Step 1: Write failing tests `src/store/storePersistence.test.ts`**

```ts
import { appStorage, useAppStore } from './store';

vi.mock('./clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      schemaVersion: 1, fortnights: [], activeFortnightId: null,
      todos: {}, notes: {}, lastRolloverDay: null,
      viewedFortnightId: null, selectedDay: null,
    });
  });

  it('persists domain state under the app key, excluding UI fields', () => {
    useAppStore.getState().initApp();
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    appStorage.flush();
    const raw = localStorage.getItem('agile-todo-app.v-state');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!);
    expect(persisted.state.fortnights).toHaveLength(1);
    expect(Object.keys(persisted.state.todos)).toHaveLength(1);
    expect(persisted.state.viewedFortnightId).toBeUndefined();
    expect(persisted.state.selectedDay).toBeUndefined();
  });

  it('importState replaces persisted fields and re-derives the view', () => {
    useAppStore.getState().initApp();
    const snapshot = {
      schemaVersion: 1,
      fortnights: useAppStore.getState().fortnights,
      activeFortnightId: useAppStore.getState().activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
    };
    useAppStore.getState().addTodo({ title: 'will vanish', priority: 'low', scheduledDay: '2026-08-18' });
    useAppStore.getState().importState(snapshot);
    expect(useAppStore.getState().todos).toEqual({});
    expect(useAppStore.getState().viewedFortnightId).toBe(snapshot.activeFortnightId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (`appStorage` / `importState` not exported).

- [ ] **Step 3: Implement in `src/store/store.ts`**

Wrap the store with `persist` and add `importState`:

```ts
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDebouncedStorage } from './persistence';
import { runMigrations, SCHEMA_VERSION } from './migrations';
import { effectiveBoardDay } from '../domain/fortnight';

export const appStorage = createDebouncedStorage();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      /* ...existing state and actions unchanged... */

      importState: (state: PersistedState) => {
        const today = todayLocal();
        const active = state.fortnights.find((f) => f.id === state.activeFortnightId) ?? null;
        set({
          ...state,
          viewedFortnightId: state.activeFortnightId,
          selectedDay: active ? effectiveBoardDay(active, today) ?? active.days[0] : null,
        });
      },
    }),
    {
      name: 'agile-todo-app.v-state',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => appStorage),
      migrate: (persisted, version) => runMigrations(persisted, version),
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        fortnights: s.fortnights,
        activeFortnightId: s.activeFortnightId,
        todos: s.todos,
        notes: s.notes,
        lastRolloverDay: s.lastRolloverDay,
      }),
    },
  ),
);
```

Add `importState: (state: PersistedState) => void;` to the `AppState` interface.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS (all previous suites too — `persist` must not break them).

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: persist store to localStorage with versioned migrations"
```

---

## UI tasks — shared conventions

- Component tests use React Testing Library + `user-event`, mock `./store/clock` exactly as in Tasks 11–13, and seed state via `useAppStore.setState(...)` + `initApp()`.
- Every UI task's test file gets this shared helper (create once in Task 14 as `src/test/seed.ts`):

```ts
import { useAppStore } from '../store/store';

export function seedApp() {
  localStorage.clear();
  useAppStore.setState({
    schemaVersion: 1, fortnights: [], activeFortnightId: null,
    todos: {}, notes: {}, lastRolloverDay: null,
    viewedFortnightId: null, selectedDay: null,
  });
  useAppStore.getState().initApp();
  return useAppStore.getState();
}
```

- Style hooks: every component gets a colocated CSS Module (`Component.module.css`). During Tasks 14–21 keep styles minimal/structural (layout only) — the visual pass is Task 22. Components must expose semantic hooks: `data-priority="high|medium|low"`, `data-category="blocker|info"`, `data-done`, `data-today` attributes so the design pass needs no logic changes.
- All copy in English. Use `<button>` for actions, `<dialog>`-like custom `Modal` (Task 18) for overlays.

---

### Task 14: App shell + board navigation (DayStrip / DayColumn skeleton)

**Files:**
- Create: `src/test/seed.ts`, `src/components/board/FortnightBoard.tsx`, `src/components/board/DayStrip.tsx`, `src/components/board/DayColumn.tsx`, `src/components/common/EmptyState.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: store + selectors (Tasks 11–13), `formatDayLabel` (Task 2).
- Produces:
  - `App` renders: `<header>` with `<h1>Agile Todo</h1>` and the fortnight date range; `FortnightBoard`.
  - `DayStrip` props: none (reads store) — renders 10 day buttons labeled via `formatDayLabel`, todo count badge per day, `data-today` on the effective board day, `aria-current="date"` on the selected day; Prev/Next buttons (`aria-label="Previous day"` / `"Next day"`) clamped at fortnight ends.
  - `DayColumn` props: none — renders the selected day heading and (for now) placeholder sections `<section aria-label="Todos">` / `<section aria-label="Notes">` with `EmptyState` ("No todos for this day" / "No notes for this day"). Filled by Tasks 15–16.
  - `main.tsx` calls `useAppStore.getState().initApp()`, `navigator.storage.persist?.()`, and registers `appStorage.flush` on `pagehide`.

- [ ] **Step 1: Write failing tests `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('App shell', () => {
  beforeEach(() => seedApp());

  it('renders the title and 10 day chips with today highlighted', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Agile Todo' })).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { name: /Aug \d+/ });
    expect(chips).toHaveLength(10);
    expect(screen.getByRole('button', { name: /Tue, Aug 18/ })).toHaveAttribute('data-today');
  });

  it('navigates days via chips and prev/next, clamped at the ends', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Wed, Aug 19/ }));
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();

    // clamp: click Next repeatedly beyond the last day
    for (let i = 0; i < 12; i++) await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByRole('heading', { name: /Fri, Aug 28/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (components don't exist yet).

- [ ] **Step 3: Implement the components**

`src/components/common/EmptyState.tsx`:

```tsx
export function EmptyState({ message }: { message: string }) {
  return <p role="status">{message}</p>;
}
```

`src/components/board/DayStrip.tsx`:

```tsx
import { useAppStore } from '../../store/store';
import { selectViewedFortnight, selectTodosForDay } from '../../store/selectors';
import { effectiveBoardDay } from '../../domain/fortnight';
import { formatDayLabel } from '../../domain/dates';
import { todayLocal } from '../../store/clock';
import styles from './DayStrip.module.css';

export function DayStrip() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  if (!fn) return null;
  const selected = state.selectedDay ?? fn.days[0];
  const idx = fn.days.indexOf(selected);
  const today = state.viewedFortnightId === state.activeFortnightId
    ? effectiveBoardDay(fn, todayLocal())
    : null;

  return (
    <nav className={styles.strip} aria-label="Fortnight days">
      <button aria-label="Previous day" disabled={idx <= 0}
        onClick={() => state.selectDay(fn.days[idx - 1])}>‹</button>
      {fn.days.map((day) => {
        const count = selectTodosForDay(state, fn.id, day).length;
        return (
          <button key={day}
            data-today={day === today ? '' : undefined}
            aria-current={day === selected ? 'date' : undefined}
            onClick={() => state.selectDay(day)}>
            {formatDayLabel(day)}{count > 0 ? ` (${count})` : ''}
          </button>
        );
      })}
      <button aria-label="Next day" disabled={idx >= fn.days.length - 1}
        onClick={() => state.selectDay(fn.days[idx + 1])}>›</button>
    </nav>
  );
}
```

`src/components/board/DayColumn.tsx`:

```tsx
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { EmptyState } from '../common/EmptyState';

export function DayColumn() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  if (!fn) return null;
  const day = state.selectedDay ?? fn.days[0];

  return (
    <div>
      <h2>{formatDayLabel(day)}</h2>
      <section aria-label="Todos">
        <EmptyState message="No todos for this day" />
      </section>
      <section aria-label="Notes">
        <EmptyState message="No notes for this day" />
      </section>
    </div>
  );
}
```

`src/components/board/FortnightBoard.tsx`:

```tsx
import { DayStrip } from './DayStrip';
import { DayColumn } from './DayColumn';

export function FortnightBoard() {
  return (
    <main>
      <DayStrip />
      <DayColumn />
    </main>
  );
}
```

`src/App.tsx`:

```tsx
import { useAppStore } from './store/store';
import { selectViewedFortnight } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';

export default function App() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  return (
    <>
      <header>
        <h1>Agile Todo</h1>
        {fn && <p>{formatDayLabel(fn.days[0])} – {formatDayLabel(fn.days[9])}</p>}
      </header>
      <FortnightBoard />
    </>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { appStorage, useAppStore } from './store/store';

useAppStore.getState().initApp();
navigator.storage?.persist?.();
window.addEventListener('pagehide', () => appStorage.flush());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `src/test/seed.ts` with the shared helper from "UI tasks — shared conventions". Delete Vite scaffold leftovers (`src/App.css` contents, logo assets) as needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: app shell with fortnight board and day navigation"
```

---

### Task 15: TodoItem + TodoForm wired into DayColumn

**Files:**
- Create: `src/components/todos/TodoItem.tsx`, `src/components/todos/TodoForm.tsx`, `src/components/common/PriorityBadge.tsx`
- Modify: `src/components/board/DayColumn.tsx`
- Test: `src/components/todos/todos.test.tsx`

**Interfaces:**
- Consumes: store CRUD actions (Task 11), `selectTodosForDay`, `selectIsReadOnly` (Task 12).
- Produces:
  - `TodoItem` props: `{ todo: Todo; readOnly: boolean }` — checkbox (`aria-label` = todo title), title (strikethrough via `data-done` when done), `PriorityBadge`, "Rolled over" badge when `todo.rolledOver`, Edit/Delete buttons hidden when `readOnly`.
  - `TodoForm` props: `{ day: ISODate; days: ISODate[]; onClose: () => void; todo?: Todo }` — fields: Title (required `<input>`), Description (`<textarea>`), Priority (`<select>` High/Medium/Low, default Medium), Day (`<select>` limited to `days`), Reminder (`<input type="datetime-local">`, optional). Submit calls `addTodo` or `updateTodo`+`rescheduleTodo`.
  - `DayColumn` now lists `TodoItem`s for the selected day and shows an "Add todo" button (hidden in read-only mode) that opens `TodoForm`.
  - `PriorityBadge` props: `{ priority: Priority }` — renders the priority word with `data-priority`.

- [ ] **Step 1: Write failing tests `src/components/todos/todos.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('todos on the board', () => {
  beforeEach(() => seedApp());

  it('adds a todo through the form (title required)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Title')).toBeInvalid(); // required, empty

    await user.type(screen.getByLabelText('Title'), 'Write tests');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('High')).toHaveAttribute('data-priority', 'high');
  });

  it('toggles done via the checkbox', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'Ship it', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Ship it' }));
    expect(Object.values(useAppStore.getState().todos)[0].done).toBe(true);
  });

  it('shows the rolled-over badge', () => {
    useAppStore.getState().addTodo({ title: 'Old task', priority: 'low', scheduledDay: '2026-08-18' });
    const id = Object.values(useAppStore.getState().todos)[0].id;
    useAppStore.setState((s) => ({
      todos: { ...s.todos, [id]: { ...s.todos[id], rolledOver: true } },
    }));
    render(<App />);
    expect(screen.getByText('Rolled over')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL ("Add todo" button not found).

- [ ] **Step 3: Implement**

`src/components/common/PriorityBadge.tsx`:

```tsx
import type { Priority } from '../../domain/types';

const LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span data-priority={priority}>{LABEL[priority]}</span>;
}
```

`src/components/todos/TodoItem.tsx`:

```tsx
import { useState } from 'react';
import type { Todo } from '../../domain/types';
import { useAppStore } from '../../store/store';
import { selectViewedFortnight } from '../../store/selectors';
import { PriorityBadge } from '../common/PriorityBadge';
import { TodoForm } from './TodoForm';

export function TodoItem({ todo, readOnly }: { todo: Todo; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const toggleDone = useAppStore((s) => s.toggleDone);
  const deleteTodo = useAppStore((s) => s.deleteTodo);
  const fn = useAppStore(selectViewedFortnight);

  if (editing && fn) {
    return <TodoForm day={todo.scheduledDay} days={fn.days} todo={todo} onClose={() => setEditing(false)} />;
  }
  return (
    <li data-done={todo.done ? '' : undefined}>
      <input type="checkbox" aria-label={todo.title} checked={todo.done}
        disabled={readOnly} onChange={() => toggleDone(todo.id)} />
      <span>{todo.title}</span>
      <PriorityBadge priority={todo.priority} />
      {todo.rolledOver && <span>Rolled over</span>}
      {todo.description && <p>{todo.description}</p>}
      {!readOnly && (
        <>
          <button onClick={() => setEditing(true)}>Edit</button>
          <button onClick={() => deleteTodo(todo.id)}>Delete</button>
        </>
      )}
    </li>
  );
}
```

`src/components/todos/TodoForm.tsx`:

```tsx
import { useState } from 'react';
import type { ISODate, Priority, Todo } from '../../domain/types';
import { formatDayLabel } from '../../domain/dates';
import { useAppStore } from '../../store/store';

interface Props { day: ISODate; days: ISODate[]; onClose: () => void; todo?: Todo }

export function TodoForm({ day, days, onClose, todo }: Props) {
  const addTodo = useAppStore((s) => s.addTodo);
  const updateTodo = useAppStore((s) => s.updateTodo);
  const rescheduleTodo = useAppStore((s) => s.rescheduleTodo);
  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? 'medium');
  const [scheduledDay, setScheduledDay] = useState<ISODate>(todo?.scheduledDay ?? day);
  const [reminderAt, setReminderAt] = useState(todo?.reminderAt ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const reminder = reminderAt === '' ? undefined : reminderAt;
    if (todo) {
      updateTodo(todo.id, { title, description: description || undefined, priority, reminderAt: reminder });
      if (scheduledDay !== todo.scheduledDay) rescheduleTodo(todo.id, scheduledDay);
    } else {
      addTodo({ title, description: description || undefined, priority, scheduledDay, reminderAt: reminder });
    }
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <label>Title<input required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label>Day
        <select value={scheduledDay} onChange={(e) => setScheduledDay(e.target.value)}>
          {days.map((d) => <option key={d} value={d}>{formatDayLabel(d)}</option>)}
        </select>
      </label>
      <label>Reminder
        <input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
      </label>
      <button type="submit">Save</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </form>
  );
}
```

Note: labels must wrap their inputs (as above) so `getByLabelText` works without `htmlFor` bookkeeping.

Update `DayColumn.tsx` — replace the Todos section:

```tsx
import { useState } from 'react';
import { selectIsReadOnly, selectTodosForDay, selectViewedFortnight } from '../../store/selectors';
import { TodoItem } from '../todos/TodoItem';
import { TodoForm } from '../todos/TodoForm';
// inside the component:
const [adding, setAdding] = useState(false);
const readOnly = selectIsReadOnly(state);
const todos = selectTodosForDay(state, fn.id, day);
// Todos section JSX:
<section aria-label="Todos">
  {!readOnly && !adding && <button onClick={() => setAdding(true)}>Add todo</button>}
  {adding && <TodoForm day={day} days={fn.days} onClose={() => setAdding(false)} />}
  {todos.length === 0
    ? <EmptyState message="No todos for this day" />
    : <ul>{todos.map((t) => <TodoItem key={t.id} todo={t} readOnly={readOnly} />)}</ul>}
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: todo list, creation and editing on the day column"
```

---

### Task 16: NoteCard + NoteForm wired into DayColumn

**Files:**
- Create: `src/components/notes/NoteCard.tsx`, `src/components/notes/NoteForm.tsx`
- Modify: `src/components/board/DayColumn.tsx`
- Test: `src/components/notes/notes.test.tsx`

**Interfaces:**
- Consumes: note CRUD actions (Task 11), `selectNotesForDay` (Task 12).
- Produces:
  - `NoteCard` props: `{ note: Note; readOnly: boolean }` — text with `data-category`; blockers show "Resolve" button (or "Resolved" text once resolved); Delete button when not read-only.
  - `NoteForm` props: `{ day: ISODate; onClose: () => void }` — Text (`<textarea>` required), Category (`<select>` Blocker/Info, default Info); submit calls `addNote`.
  - `DayColumn` Notes section mirrors the Todos section ("Add note" button).

- [ ] **Step 1: Write failing tests `src/components/notes/notes.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('notes on the board', () => {
  beforeEach(() => seedApp());

  it('adds a blocker note and resolves it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByLabelText('Text'), 'Waiting on credentials');
    await user.selectOptions(screen.getByLabelText('Category'), 'blocker');
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    const card = screen.getByText('Waiting on credentials');
    expect(card).toHaveAttribute('data-category', 'blocker');

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(Object.values(useAppStore.getState().notes)[0].resolved).toBe(true);
  });

  it('info notes have no Resolve button', () => {
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'info', text: 'FYI: release Friday' });
    render(<App />);
    expect(screen.getByText('FYI: release Friday')).toHaveAttribute('data-category', 'info');
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL ("Add note" button not found).

- [ ] **Step 3: Implement**

`src/components/notes/NoteCard.tsx`:

```tsx
import type { Note } from '../../domain/types';
import { useAppStore } from '../../store/store';

export function NoteCard({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const resolveBlocker = useAppStore((s) => s.resolveBlocker);
  const deleteNote = useAppStore((s) => s.deleteNote);
  return (
    <li>
      <span data-category={note.category}>{note.text}</span>
      {note.category === 'blocker' && (
        note.resolved
          ? <span>Resolved</span>
          : !readOnly && <button onClick={() => resolveBlocker(note.id)}>Resolve</button>
      )}
      {!readOnly && <button onClick={() => deleteNote(note.id)} aria-label={`Delete note: ${note.text}`}>Delete</button>}
    </li>
  );
}
```

`src/components/notes/NoteForm.tsx`:

```tsx
import { useState } from 'react';
import type { ISODate, NoteCategory } from '../../domain/types';
import { useAppStore } from '../../store/store';

export function NoteForm({ day, onClose }: { day: ISODate; onClose: () => void }) {
  const addNote = useAppStore((s) => s.addNote);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<NoteCategory>('info');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote({ day, category, text });
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <label>Text<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label>
      <label>Category
        <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}>
          <option value="info">Info</option>
          <option value="blocker">Blocker</option>
        </select>
      </label>
      <button type="submit">Save note</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </form>
  );
}
```

Update `DayColumn.tsx` Notes section (mirror of Todos):

```tsx
const [addingNote, setAddingNote] = useState(false);
const notes = selectNotesForDay(state, fn.id, day);
// Notes section JSX:
<section aria-label="Notes">
  {!readOnly && !addingNote && <button onClick={() => setAddingNote(true)}>Add note</button>}
  {addingNote && <NoteForm day={day} onClose={() => setAddingNote(false)} />}
  {notes.length === 0
    ? <EmptyState message="No notes for this day" />
    : <ul>{notes.map((n) => <NoteCard key={n.id} note={n} readOnly={readOnly} />)}</ul>}
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: per-day notes with blocker and info categories"
```

---

### Task 17: RemindersPanel + useNow

**Files:**
- Create: `src/components/reminders/RemindersPanel.tsx`, `src/hooks/useNow.ts`
- Modify: `src/App.tsx` (render the panel next to the board)
- Test: `src/components/reminders/reminders.test.tsx`

**Interfaces:**
- Consumes: `partitionReminders` (Task 7), store.
- Produces:
  - `useNow(intervalMs = 30_000): Date` — state initialized to `new Date()`, refreshed on an interval (cleared on unmount). This hook may read ambient time: it represents the UI clock, not domain logic.
  - `RemindersPanel` — `<aside aria-label="Reminders">` with an "Overdue" list and an "Upcoming" list (only sections with content render; whole panel hidden when no reminders). Each entry: todo title + reminder time; clicking selects that todo's day (`selectDay`). `TodoItem` additionally shows an "Overdue" badge when its reminder is `<= now` and the todo isn't done.

- [ ] **Step 1: Write failing tests `src/components/reminders/reminders.test.tsx`**

```tsx
import { render, screen, act } from '@testing-library/react';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('reminders panel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 7, 18, 12, 0) });
    seedApp();
  });
  afterEach(() => vi.useRealTimers());

  it('lists overdue and upcoming reminders', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'Late', priority: 'high', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T09:00' });
    st.addTodo({ title: 'Soon', priority: 'low', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T15:00' });
    render(<App />);
    const panel = screen.getByRole('complementary', { name: 'Reminders' });
    expect(panel).toHaveTextContent('Overdue');
    expect(panel).toHaveTextContent('Late');
    expect(panel).toHaveTextContent('Upcoming');
    expect(panel).toHaveTextContent('Soon');
  });

  it('moves an upcoming reminder to overdue as time passes', () => {
    useAppStore.getState().addTodo({
      title: 'Soon', priority: 'low', scheduledDay: '2026-08-18', reminderAt: '2026-08-18T12:15',
    });
    render(<App />);
    const panel = screen.getByRole('complementary', { name: 'Reminders' });
    expect(panel).toHaveTextContent('Upcoming');
    act(() => vi.advanceTimersByTime(16 * 60 * 1000)); // 16 minutes
    expect(panel).toHaveTextContent('Overdue');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (no `complementary` region).

- [ ] **Step 3: Implement**

`src/hooks/useNow.ts`:

```ts
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`src/components/reminders/RemindersPanel.tsx`:

```tsx
import { useAppStore } from '../../store/store';
import { partitionReminders } from '../../domain/reminders';
import { useNow } from '../../hooks/useNow';
import type { Todo } from '../../domain/types';

function ReminderList({ title, items, onPick }: { title: string; items: Todo[]; onPick: (t: Todo) => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((t) => (
          <li key={t.id}>
            <button onClick={() => onPick(t)}>
              {t.title} — {t.reminderAt!.replace('T', ' ')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RemindersPanel() {
  const todos = useAppStore((s) => s.todos);
  const selectDay = useAppStore((s) => s.selectDay);
  const now = useNow();
  const { overdue, upcoming } = partitionReminders(todos, now);
  if (overdue.length === 0 && upcoming.length === 0) return null;
  return (
    <aside aria-label="Reminders">
      <h2>Reminders</h2>
      <ReminderList title="Overdue" items={overdue} onPick={(t) => selectDay(t.scheduledDay)} />
      <ReminderList title="Upcoming" items={upcoming} onPick={(t) => selectDay(t.scheduledDay)} />
    </aside>
  );
}
```

In `App.tsx`, render `<RemindersPanel />` after `<FortnightBoard />`. In `TodoItem.tsx`, add the overdue badge:

```tsx
const now = useNow();
const overdue = !todo.done && todo.reminderAt !== undefined && new Date(todo.reminderAt) <= now;
// in JSX: {overdue && <span data-overdue="">Overdue</span>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: visual reminders panel with overdue and upcoming sections"
```

---

### Task 18: Modal + StandupModal with copy-to-clipboard

**Files:**
- Create: `src/components/common/Modal.tsx`, `src/components/standup/StandupModal.tsx`
- Modify: `src/App.tsx` (Standup button in the header)
- Test: `src/components/standup/standup.test.tsx`

**Interfaces:**
- Consumes: `buildStandup`, `formatStandup` (Task 6), `todayLocal`.
- Produces:
  - `Modal` props: `{ title: string; onClose: () => void; children: ReactNode }` — `role="dialog"` + `aria-label={title}`, close button (`aria-label="Close"`), closes on Escape.
  - `StandupModal` props: `{ onClose: () => void }` — three headed sections ("Yesterday", "Today", "Blockers") listing titles/texts (or "None"); "Copy to clipboard" button writes `formatStandup(...)` and swaps its label to "Copied!" for 2 s.
  - Header gets a `Standup` button that opens the modal.

- [ ] **Step 1: Write failing tests `src/components/standup/standup.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('standup modal', () => {
  beforeEach(() => {
    seedApp();
    const st = useAppStore.getState();
    st.addTodo({ title: 'Done yesterday', priority: 'medium', scheduledDay: '2026-08-17' });
    const done = Object.values(useAppStore.getState().todos)[0];
    useAppStore.setState((s) => ({
      todos: {
        ...s.todos,
        [done.id]: { ...done, done: true, completedAt: new Date(2026, 7, 17, 16, 0).toISOString() },
      },
    }));
    useAppStore.getState().addTodo({ title: 'For today', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'API down' });
  });

  it('shows yesterday, today and blockers', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    const dialog = screen.getByRole('dialog', { name: 'Daily standup' });
    expect(dialog).toHaveTextContent('Done yesterday');
    expect(dialog).toHaveTextContent('For today');
    expect(dialog).toHaveTextContent('API down');
  });

  it('copies the formatted standup to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Standup' }));
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    expect(writeText).toHaveBeenCalledWith(
      '*Yesterday*\n- Done yesterday\n\n*Today*\n- For today\n\n*Blockers*\n- API down',
    );
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (Standup button not found).

- [ ] **Step 3: Implement**

`src/components/common/Modal.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={title} aria-modal="true">
      <header>
        <h2>{title}</h2>
        <button aria-label="Close" onClick={onClose}>×</button>
      </header>
      {children}
    </div>
  );
}
```

`src/components/standup/StandupModal.tsx`:

```tsx
import { useState } from 'react';
import { useAppStore } from '../../store/store';
import { buildStandup, formatStandup } from '../../domain/standup';
import { todayLocal } from '../../store/clock';
import { Modal } from '../common/Modal';

export function StandupModal({ onClose }: { onClose: () => void }) {
  const { todos, notes, activeFortnightId } = useAppStore();
  const [copied, setCopied] = useState(false);
  const data = buildStandup(todos, notes, activeFortnightId!, todayLocal());

  const copy = async () => {
    await navigator.clipboard.writeText(formatStandup(data));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const section = (title: string, lines: string[]) => (
    <section>
      <h3>{title}</h3>
      <ul>{lines.length ? lines.map((l, i) => <li key={i}>{l}</li>) : <li>None</li>}</ul>
    </section>
  );

  return (
    <Modal title="Daily standup" onClose={onClose}>
      {section('Yesterday', data.yesterday.map((t) => t.title))}
      {section('Today', data.today.map((t) => t.title))}
      {section('Blockers', data.blockers.map((n) => n.text))}
      <button onClick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
    </Modal>
  );
}
```

In `App.tsx`: add `const [standupOpen, setStandupOpen] = useState(false);`, a header `<button onClick={() => setStandupOpen(true)}>Standup</button>`, and `{standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: daily standup modal with clipboard export"
```

---

### Task 19: Regenerate fortnight + history browsing (read-only)

**Files:**
- Create: `src/components/history/FortnightSwitcher.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/history/history.test.tsx`

**Interfaces:**
- Consumes: `regenerateFortnight`, `viewFortnight` (Tasks 11–12), `selectFortnightExpired`, `selectIsReadOnly`.
- Produces:
  - Header button `Generate new fortnight` → `window.confirm('Generate a new fortnight starting this week? Incomplete todos will carry over.')` → `regenerateFortnight()`.
  - Expired banner: when `selectFortnightExpired`, show `role="alert"` text "This fortnight has ended. Generate a new one to continue." above the board.
  - `FortnightSwitcher`: `<select aria-label="Fortnight">` listing all fortnights newest-first as "Aug 17 – Aug 28" ranges with " (current)" suffix on the active one; changing it calls `viewFortnight`.
  - Read-only banner: when viewing history, `role="status"` text "Viewing a past fortnight (read-only)."

- [ ] **Step 1: Write failing tests `src/components/history/history.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('regenerate + history', () => {
  beforeEach(() => seedApp());

  it('regenerates after confirm and lists the old fortnight in the switcher', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));
    expect(useAppStore.getState().fortnights).toHaveLength(2);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('(current)');
  });

  it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-08-18' });
    const t = Object.values(useAppStore.getState().todos)[0];
    useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Generate new fortnight' }));

    const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fortnight' }), oldOption);
    expect(screen.getByText('Viewing a past fortnight (read-only).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tue, Aug 18/ }));
    expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (Generate button not found).

- [ ] **Step 3: Implement**

`src/components/history/FortnightSwitcher.tsx`:

```tsx
import { useAppStore } from '../../store/store';
import { formatDayLabel } from '../../domain/dates';

export function FortnightSwitcher() {
  const fortnights = useAppStore((s) => s.fortnights);
  const activeId = useAppStore((s) => s.activeFortnightId);
  const viewedId = useAppStore((s) => s.viewedFortnightId);
  const viewFortnight = useAppStore((s) => s.viewFortnight);
  if (fortnights.length < 2) return null;

  return (
    <select aria-label="Fortnight" value={viewedId ?? ''}
      onChange={(e) => viewFortnight(e.target.value)}>
      {[...fortnights].reverse().map((f) => (
        <option key={f.id} value={f.id}>
          {formatDayLabel(f.days[0])} – {formatDayLabel(f.days[9])}
          {f.id === activeId ? ' (current)' : ''}
        </option>
      ))}
    </select>
  );
}
```

In `App.tsx` add to the header:

```tsx
<button onClick={() => {
  if (window.confirm('Generate a new fortnight starting this week? Incomplete todos will carry over.')) {
    regenerateFortnight();
  }
}}>Generate new fortnight</button>
<FortnightSwitcher />
```

And above the board:

```tsx
{selectFortnightExpired(state) && (
  <p role="alert">This fortnight has ended. Generate a new one to continue.</p>
)}
{selectIsReadOnly(state) && (
  <p role="status">Viewing a past fortnight (read-only).</p>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: fortnight regeneration and read-only history browsing"
```

---

### Task 20: Backup controls (export/import UI)

**Files:**
- Create: `src/components/common/BackupControls.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/common/backup.test.tsx`

**Interfaces:**
- Consumes: `serializeState`, `parseBackup` (Task 10), `importState` (Task 13), `appStorage.flush`.
- Produces: header `Export backup` button (downloads `agile-todo-app-backup-<today>.json` via a temporary object URL) and `Import backup` label wrapping `<input type="file" accept="application/json">`. Import errors render in a `role="alert"` paragraph; success replaces state and flushes storage.

- [ ] **Step 1: Write failing tests `src/components/common/backup.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';
import { serializeState } from '../../store/exportImport';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('backup controls', () => {
  beforeEach(() => seedApp());

  it('imports a valid backup file and replaces state', async () => {
    const user = userEvent.setup();
    const s = useAppStore.getState();
    const backup = serializeState({
      schemaVersion: 1, fortnights: s.fortnights, activeFortnightId: s.activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
    });
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });

    render(<App />);
    const file = new File([backup], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import backup'), file);
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('shows an error for an invalid file', async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import backup'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (Import control not found).

- [ ] **Step 3: Implement `src/components/common/BackupControls.tsx`**

```tsx
import { useState } from 'react';
import { appStorage, useAppStore } from '../../store/store';
import { parseBackup, serializeState } from '../../store/exportImport';
import { todayLocal } from '../../store/clock';

export function BackupControls() {
  const [error, setError] = useState<string | null>(null);

  const exportBackup = () => {
    const s = useAppStore.getState();
    const json = serializeState({
      schemaVersion: s.schemaVersion, fortnights: s.fortnights,
      activeFortnightId: s.activeFortnightId, todos: s.todos, notes: s.notes,
      lastRolloverDay: s.lastRolloverDay,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `agile-todo-app-backup-${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const state = parseBackup(await file.text());
      useAppStore.getState().importState(state);
      appStorage.flush();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <div>
      <button onClick={exportBackup}>Export backup</button>
      <label>Import backup
        <input type="file" accept="application/json" onChange={importBackup} />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

Render `<BackupControls />` in the `App.tsx` header.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: JSON backup export and import"
```

---

### Task 21: Day-change watcher

**Files:**
- Create: `src/hooks/useDayChangeWatcher.ts`
- Modify: `src/App.tsx`
- Test: `src/hooks/useDayChangeWatcher.test.tsx`

**Interfaces:**
- Consumes: `checkDayTick` (Task 12).
- Produces: `useDayChangeWatcher(): void` — on mount, subscribes a 60 s `setInterval`, `visibilitychange`, and `focus` listeners, each calling `useAppStore.getState().checkDayTick()`; all cleaned up on unmount. Called once from `App`.

- [ ] **Step 1: Write failing tests `src/hooks/useDayChangeWatcher.test.tsx`**

```tsx
import { render, act } from '@testing-library/react';
import App from '../App';
import { seedApp } from '../test/seed';
import { useAppStore } from '../store/store';

const clock = { today: '2026-08-18' };
vi.mock('../store/clock', () => ({
  todayLocal: () => clock.today,
  nowIso: () => `${clock.today}T12:00:00.000Z`,
}));

describe('useDayChangeWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clock.today = '2026-08-18';
    seedApp();
  });
  afterEach(() => vi.useRealTimers());

  it('rolls over when the interval ticks past midnight', () => {
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    render(<App />);
    clock.today = '2026-08-19';
    act(() => vi.advanceTimersByTime(60_000));
    expect(Object.values(useAppStore.getState().todos)[0].scheduledDay).toBe('2026-08-19');
  });

  it('rolls over on visibilitychange', () => {
    useAppStore.getState().addTodo({ title: 'x', priority: 'low', scheduledDay: '2026-08-18' });
    render(<App />);
    clock.today = '2026-08-19';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(Object.values(useAppStore.getState().todos)[0].scheduledDay).toBe('2026-08-19');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL (todo stays on 2026-08-18).

- [ ] **Step 3: Implement `src/hooks/useDayChangeWatcher.ts`**

```ts
import { useEffect } from 'react';
import { useAppStore } from '../store/store';

export function useDayChangeWatcher(): void {
  useEffect(() => {
    const tick = () => useAppStore.getState().checkDayTick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);
}
```

Call `useDayChangeWatcher();` at the top of the `App` component.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: midnight and focus-based day-change detection"
```

---

### Task 22: Visual design pass (frontend-design skill)

**Files:**
- Create: `src/styles/tokens.css`, one `*.module.css` per component
- Modify: `index.html` (fonts via system stack only — no external requests), all components (className wiring only)

**Interfaces:**
- Consumes: the `data-priority` / `data-category` / `data-done` / `data-today` / `data-overdue` hooks placed in Tasks 14–21.
- Produces: the professional visual layer. **No behavior changes; every existing test must stay green.**

- [ ] **Step 1: Invoke the `frontend-design:frontend-design` skill** and design within these constraints:
  - Layout: header bar; horizontally scrollable `DayStrip` of day chips; focused day column (max-width readable measure); `RemindersPanel` as a right-hand sidebar on ≥1024px, stacked below on mobile.
  - Semantics to encode in color/weight: priority (high = strongest accent, low = muted), blocker notes vs info notes, done (muted + strikethrough), today chip (accented ring), rolled-over and overdue badges (attention colors).
  - Design tokens in `src/styles/tokens.css` as CSS custom properties: color palette (including `--color-priority-high/medium/low`, `--color-blocker`, `--color-info`), spacing scale, type scale, radius, shadow. Support `prefers-color-scheme: dark`.
  - System font stack; no external assets (the app must work fully offline).
  - Transitions: subtle (checkbox completion, modal enter) — respect `prefers-reduced-motion`.

- [ ] **Step 2: Run the full test suite to prove zero behavior change**

Run: `npm test` → Expected: all suites PASS unchanged.

- [ ] **Step 3: Manual review**

Run: `npm run dev` and inspect: board, forms, modal, reminders panel, history view, empty states, mobile viewport (360px), dark mode.

- [ ] **Step 4: Commit**

```bash
git add src index.html
git commit -m "style: professional visual design pass with design tokens"
```

---

### Task 23: Accessibility + keyboard navigation

**Files:**
- Modify: `src/components/common/Modal.tsx` (focus trap), `src/components/board/DayStrip.tsx` (arrow-key navigation)
- Test: `src/a11y.test.tsx`

**Interfaces:**
- Consumes: existing components.
- Produces: ←/→ arrow keys on the day strip move the selected day (clamped); `Modal` traps focus (Tab cycles inside, focus moves to the dialog on open and returns to the trigger on close); all interactive elements keyboard-reachable with visible focus rings (`:focus-visible` styles in tokens/module CSS).

- [ ] **Step 1: Write failing tests `src/a11y.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { seedApp } from './test/seed';

vi.mock('./store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('keyboard navigation', () => {
  beforeEach(() => seedApp());

  it('arrow keys move the selected day on the strip', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('navigation', { name: 'Fortnight days' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: /Wed, Aug 19/ })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();
  });

  it('modal moves focus in and restores it on close', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Standup' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Daily standup' })).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → Expected: FAIL.

- [ ] **Step 3: Implement**

`DayStrip`: add `tabIndex={0}` and an `onKeyDown` on the `<nav>`:

```tsx
onKeyDown={(e) => {
  if (e.key === 'ArrowRight' && idx < fn.days.length - 1) state.selectDay(fn.days[idx + 1]);
  if (e.key === 'ArrowLeft' && idx > 0) state.selectDay(fn.days[idx - 1]);
}}
```

`Modal`: on mount, store `document.activeElement`, focus the dialog container (`tabIndex={-1}` + `ref`), and restore focus in the cleanup; trap Tab:

```tsx
const ref = useRef<HTMLDivElement>(null);
useEffect(() => {
  const prev = document.activeElement as HTMLElement | null;
  ref.current?.focus();
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const focusables = ref.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  };
  window.addEventListener('keydown', trap);
  return () => {
    window.removeEventListener('keydown', trap);
    prev?.focus();
  };
}, []);
// <div role="dialog" ref={ref} tabIndex={-1} ...>
```

Add `:focus-visible` outline styles to `tokens.css`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: keyboard navigation and modal focus management"
```

---

### Task 24: Final verification

**Files:** none new.

- [ ] **Step 1: Full automated verification**

```bash
npm test          # all suites pass
npx tsc --noEmit  # zero type errors
npm run build     # production build succeeds
```

- [ ] **Step 2: Manual smoke script** (run `npm run dev`):
  1. First run: fortnight for this week + next appears, today selected.
  2. Add todos with priorities and a reminder in the past → Overdue badge + panel entry.
  3. Add a blocker note and an info note.
  4. Open Standup → sections correct → Copy to clipboard → paste somewhere.
  5. Reload the page → everything persists.
  6. DevTools → Application → Local Storage: single `agile-todo-app.v-state` key.
  7. Export backup → clear site data → reload → Import backup → state restored.
  8. Generate new fortnight (confirm dialog) → incomplete todos carried to today, done ones visible via the fortnight switcher in read-only mode.
  9. Mobile viewport (360px) and dark mode look right.

- [ ] **Step 3: Fix anything found, re-run, commit**

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

## Self-review checklist (for the executing model, after Task 24)

- Every spec §feature maps to a task: fortnight board (T3/T14), regenerate+carry-over (T5/T12/T19), rollover (T4/T12/T21), todos+priorities (T11/T15), notes blocker/info (T11/T16), reminders (T7/T17), standup modal (T6/T18), persistence+backup (T8–T10/T13/T20), professional UI (T22), a11y (T23).
- No orphan interfaces: every `Produces:` symbol is consumed by a later task or the UI.
- Run `superpowers:requesting-code-review` before declaring the project done.





