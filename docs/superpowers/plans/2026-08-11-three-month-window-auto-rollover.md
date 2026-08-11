# Three-Month Window + Automatic Month Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all human interaction from month transitions — the next month auto-generates on the first day tick after the active month ends, history is pruned to a fixed 3-month window, and the history dropdown becomes a `‹ Month YYYY ›` stepper.

**Architecture:** A new pure `pruneToRetention` in `src/domain/fortnight.ts` implements the month-keyed retention window; `src/store/store.ts` gains a shared `buildGeneration` helper that `checkDayTick` (expiry checked *before* the `lastRolloverDay` latch), the retained-as-internal `regenerateFortnight`, and `initApp`'s dangling-id recovery all route through; `FortnightNav` replaces `FortnightSwitcher` in the header while the manual Generate button / ConfirmDialog / expired banner / palette action are deleted from `App.tsx`. No `PersistedState` change, no `SCHEMA_VERSION` bump, no migration, no `partialize`/`validatePersistedState` change (spec §4, INV-6).

**Tech Stack:** React 19 + TypeScript strict + Zustand 5 + Vitest 4 + RTL + CSS Modules

## Global Constraints

- `npm run verify` (typecheck + 314-test suite) is the definition of done — run it at the end of every task.
- **Never** `npx tsc --noEmit` — it checks zero files at this repo root; always `npm run typecheck`.
- `globals: true` in Vitest — never `import { describe, it, expect, vi } from 'vitest'`.
- Clock is mocked by mocking the `clock` module (path relative to the test file), never `vi.setSystemTime`; day-advance tests close over a mutable `const clock = { today: '...' }`.
- Canonical fixture date: **2026-08-18, a Tuesday**; seeded active month is Aug 3–31, 2026 (21 workdays).
- User-visible copy says "month"; code identifiers keep the legacy "fortnight" naming — `FortnightNav` keeps the prefix deliberately (do not "fix" TD-14 piecemeal).
- No new runtime dependencies (the set stays `react`, `react-dom`, `zustand`).
- CSS Modules 1:1 per component, tokens only (no hard-coded colors), no `composes:`/`:global` (INV-12).
- Queries are role/label-based (`getByRole('button', { name: '...' })`), no test-ids (INV-10); component tests seed via `seedApp()`.
- No schema bump: `PersistedState` shape is untouched; pruning runs **only** inside generation — never on import, rehydration, or migration.
- INV-1/INV-2/INV-3 hold throughout: no UTC string slicing for scheduling dates, no ambient time outside `clock.ts`/`useNow.ts`, `src/domain/` imports only its siblings.
---

### A resolved spec tension you must not "fix" back (read before Task 1)

Spec §1 phrases retention as "intersects `{month(today), −1, −2}`", but spec §2's **approved** gap decision says: *"a user away from August to November gets exactly one new month (November)… History keeps the last actually-used months until new real months displace them. No empty ghost months — they would instantly evict real history from the 3-slot window."* Under a literal today-keyed window, August would be evicted at the November tick whether or not ghost months exist — making the approved rationale incoherent. The two statements only cohere if retention is keyed to the **3 newest calendar months actually present among stored periods** (capped at `month(today)`; later months — the weekend-tail active month — are always retained). In the steady state (consecutive months) this is *identical* to "intersects {month(today), −1, −2}"; it differs only in the gap case, where it implements the approved decision. That is the model this plan implements; `firstOfPrevMonth` is therefore **not needed** (retention is pure `slice(0, 7)` month-key comparison, no date arithmetic — the spec's §1 wording anticipated this: the helper was conditional on "if the retention floor needs date arithmetic").

---

## Task 1: `pruneToRetention` — pure domain retention window

**Files:**
- Modify: `src/domain/fortnight.test.ts` (append a new `describe` after the `adaptFortnightToMonth` block ending at line 302; extend the import on line 1)
- Modify: `src/domain/fortnight.ts` (append after `adaptFortnightToMonth`, line 150; no import changes — the function uses only string ops, keeping INV-3 trivially)

**Interfaces:**
- Produces: `pruneToRetention(fortnights: Fortnight[], todos: Record<string, Todo>, notes: Record<string, Note>, today: ISODate): { fortnights: Fortnight[]; todos: Record<string, Todo>; notes: Record<string, Note> }`
- Consumes: nothing new (`Fortnight`/`Todo`/`Note`/`ISODate` from `./types`, already imported at line 1 of `fortnight.ts`).

**Steps:**

- [ ] **Write the failing domain tests.** In `src/domain/fortnight.test.ts`, change line 1 from
  ```ts
  import { generateMonthDays, effectiveBoardDay, adaptFortnightToMonth } from './fortnight';
  ```
  to
  ```ts
  import { generateMonthDays, effectiveBoardDay, adaptFortnightToMonth, pruneToRetention } from './fortnight';
  ```
  and append at the end of the file (after line 302):

  ```ts
  describe('pruneToRetention', () => {
    function period(id: string, days: string[]): Fortnight {
      return { id, startDay: days[0], days, createdAt: `${days[0]}T09:00:00.000Z` };
    }
    function todoIn(id: string, fortnightId: string, day: string): Todo {
      return {
        id, fortnightId, title: id, priority: 'low', scheduledDay: day,
        done: true, completedAt: `${day}T15:00:00.000Z`,
        createdAt: `${day}T09:00:00.000Z`, rolledOver: false,
      };
    }
    function noteIn(id: string, fortnightId: string, day: string): Note {
      return {
        id, fortnightId, day, category: 'info', text: id,
        resolved: false, createdAt: `${day}T09:00:00.000Z`,
      };
    }

    // Legacy-style short periods (length-agnostic per INV-4) in distinct months.
    const may = period('p-may', ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08']);
    const june = period('p-jun', ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
    const july = period('p-jul', ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']);
    const august = period('p-aug', generateMonthDays('2026-08-18'));
    const september = period('p-sep', generateMonthDays('2026-09-01'));

    it('keeps the 3 newest calendar months present and drops everything older, todos/notes included', () => {
      const todos = {
        keep: todoIn('keep', 'p-jul', '2026-07-06'),
        dropA: todoIn('dropA', 'p-may', '2026-05-04'),
        dropB: todoIn('dropB', 'p-jun', '2026-06-01'),
      };
      const notes = {
        kept: noteIn('kept', 'p-aug', '2026-08-04'),
        gone: noteIn('gone', 'p-may', '2026-05-05'),
      };
      const result = pruneToRetention([may, june, july, august, september], todos, notes, '2026-09-01');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
      expect(Object.keys(result.todos)).toEqual(['keep']);
      expect(Object.keys(result.notes)).toEqual(['kept']);
    });

    it('passes retained todos/notes through byte-identical (same references)', () => {
      const t = todoIn('t', 'p-aug', '2026-08-04');
      const n = noteIn('n', 'p-aug', '2026-08-04');
      const result = pruneToRetention([may, july, august, september], { t }, { n }, '2026-09-01');
      expect(result.todos.t).toBe(t);
      expect(result.notes.n).toBe(n);
    });

    it('is a no-op returning the same references when nothing falls outside the window', () => {
      const fortnights = [july, august, september];
      const todos = { t: todoIn('t', 'p-jul', '2026-07-06') };
      const notes = {};
      const result = pruneToRetention(fortnights, todos, notes, '2026-09-01');
      expect(result.fortnights).toBe(fortnights);
      expect(result.todos).toBe(todos);
      expect(result.notes).toBe(notes);
    });

    it('two legacy periods inside one calendar month occupy ONE retention slot: both survive together', () => {
      const julyB = period('p-jul-b', ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']);
      const result = pruneToRetention([june, july, julyB, august, september], {}, {}, '2026-09-01');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-jul-b', 'p-aug', 'p-sep']);
    });

    it('a legacy period in month−3 drops even when the total count is small', () => {
      // June is month−3 relative to September: exactly one month past the window.
      const result = pruneToRetention([june, july, august, september], {}, {}, '2026-09-01');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
    });

    it('never drops the active fortnight: weekend-tail generation puts the active month AFTER month(today)', () => {
      // Sat 2026-10-31 falls after October's last workday (Fri Oct 30), so the
      // freshly generated active month is November while today is still October.
      const september2 = period('p-sep2', generateMonthDays('2026-09-01'));
      const october = period('p-oct', generateMonthDays('2026-10-15'));
      const november = period('p-nov', generateMonthDays('2026-10-31')); // rolls forward to November
      const result = pruneToRetention([august, september2, october, november], {}, {}, '2026-10-31');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-aug', 'p-sep2', 'p-oct', 'p-nov']);
    });

    it('a months-long gap keeps the last actually-used months -- no eviction by empty ghost months', () => {
      // Away from August to November: the months present are Jun/Jul/Aug + the
      // new Nov. The 3 newest months PRESENT are Jul/Aug/Nov -- June drops,
      // real history stays (approved gap decision, spec §2).
      const november = period('p-nov', generateMonthDays('2026-11-16'));
      const result = pruneToRetention([june, july, august, november], {}, {}, '2026-11-16');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-nov']);
    });

    it('a legacy period spanning two months is keyed by the month it ends in (intersects rule)', () => {
      const spanning = period('p-span', [
        '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
        '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
      ]);
      const october = period('p-oct', generateMonthDays('2026-10-01'));
      // Window at Oct (months present: Aug/Sep/Oct) reaches back to August, and
      // the spanning period's tail is in August -- it survives.
      const kept = pruneToRetention([spanning, august, september, october], {}, {}, '2026-10-01');
      expect(kept.fortnights.map((f) => f.id)).toEqual(['p-span', 'p-aug', 'p-sep', 'p-oct']);
      // Once November arrives the window is Sep/Oct/Nov -- it drops.
      const november = period('p-nov', generateMonthDays('2026-11-02'));
      const dropped = pruneToRetention([spanning, august, september, october, november], {}, {}, '2026-11-02');
      expect(dropped.fortnights.map((f) => f.id)).toEqual(['p-sep', 'p-oct', 'p-nov']);
    });

    it('is tolerant of many months (imported archive): keeps the newest 3, throws nothing', () => {
      const feb = period('p-feb', ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06']);
      const mar = period('p-mar', ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
      const apr = period('p-apr', ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10']);
      const result = pruneToRetention([feb, mar, apr, may, june, july, august, september], {}, {}, '2026-09-01');
      expect(result.fortnights.map((f) => f.id)).toEqual(['p-jul', 'p-aug', 'p-sep']);
    });
  });
  ```
  (All fixture start days are Mondays: 2026-02-02, -03-02, -04-06, -05-04, -06-01, -07-06, -07-20, -07-27 — verified against the repo's canonical Monday 2026-08-10.)

- [ ] **See them fail:** `npx vitest run src/domain/fortnight.test.ts` — expect the whole file to error at load with `SyntaxError: The requested module './fortnight' does not provide an export named 'pruneToRetention'` (the import line fails before any test runs).

- [ ] **Minimal implementation.** Append to `src/domain/fortnight.ts` (after the closing `}` of `adaptFortnightToMonth`, line 150):

  ```ts
  /** Fixed three-month retention window (spec 2026-08-11): keep every period
   *  whose day range intersects one of the 3 newest calendar months that have
   *  stored periods; drop the rest -- along with the dropped periods' todos
   *  and notes. Leaving orphans is not neutral: partitionReminders and
   *  buildStandup scan all todos/notes with no fortnightId filter, so
   *  orphaned items would surface forever with no board to reach them from
   *  (the INV-9 orphan class).
   *
   *  Counted by calendar month, NOT by array entries: two legacy 10-day
   *  fortnights inside one July occupy one retention slot (INV-4 -- legacy
   *  periods persist unmigrated). Keyed by the months actually present
   *  (capped at month(today)) rather than by a literal {month(today), -1, -2}
   *  so a months-long absence never evicts real history in favor of empty
   *  ghost months (approved gap decision: history keeps the last
   *  actually-used months until new real months displace them). A period is
   *  keyed by the month its LAST day falls in -- for an ascending window
   *  that is exactly "intersects". Periods in months after month(today)
   *  (the weekend-tail active month) are always retained, which is what
   *  makes "never drops the active fortnight" hold by construction.
   *  Tolerant of any number of months (imported archives); retained
   *  todos/notes pass through byte-identical, and when nothing is dropped
   *  the inputs are returned as-is. */
  export function pruneToRetention(
    fortnights: Fortnight[],
    todos: Record<string, Todo>,
    notes: Record<string, Note>,
    today: ISODate,
  ): { fortnights: Fortnight[]; todos: Record<string, Todo>; notes: Record<string, Note> } {
    const currentMonth = today.slice(0, 7);
    const monthOf = (f: Fortnight): string => f.days[f.days.length - 1].slice(0, 7);
    const retainedMonths = new Set(
      [...new Set(fortnights.map(monthOf).filter((m) => m <= currentMonth))]
        .sort()
        .reverse()
        .slice(0, 3),
    );
    const kept = fortnights.filter((f) => monthOf(f) > currentMonth || retainedMonths.has(monthOf(f)));
    if (kept.length === fortnights.length) return { fortnights, todos, notes };

    const keptIds = new Set(kept.map((f) => f.id));
    const keptTodos: Record<string, Todo> = {};
    for (const t of Object.values(todos)) if (keptIds.has(t.fortnightId)) keptTodos[t.id] = t;
    const keptNotes: Record<string, Note> = {};
    for (const n of Object.values(notes)) if (keptIds.has(n.fortnightId)) keptNotes[n.id] = n;
    return { fortnights: kept, todos: keptTodos, notes: keptNotes };
  }
  ```
  (Note: `slice(0, 7)` on an `ISODate` is a *local* calendar-date string — INV-1 forbids slicing `toISOString()`, which this never touches.)

- [ ] **See them pass:** `npx vitest run src/domain/fortnight.test.ts` — all tests green (existing + 9 new).
- [ ] **Full gate:** `npm run verify` — green (nothing consumes the new export yet).
- [ ] **Commit:** `git add src/domain/fortnight.ts src/domain/fortnight.test.ts && git commit -m "feat: add pruneToRetention, the 3-month retention window (domain)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 2: store — automatic generation in `checkDayTick`, shared `buildGeneration` helper

**Files:**
- Modify: `src/store/dayTick.test.ts` (imports at lines 1–7; append a new `describe` after the `regenerateFortnight` block ending at line 105; the existing `reset()` at lines 9–17 and both existing `describe`s stay as-is)
- Modify: `src/store/store.ts` — import line 6; `AppState` action comments lines 46–47; new `buildGeneration` after `buildFortnight` (lines 75–78); `initApp`'s else-branch lines 145–160; `checkDayTick` lines 163–183; `regenerateFortnight` lines 185–201

**Interfaces:**
- Consumes: `pruneToRetention` (Task 1), existing `carryOverTodos`/`carryOverNotes`/`effectiveBoardDay`/`generateMonthDays` (already imported), `applyRollover`/`applyNoteRollover` (unchanged).
- Produces (module-private): `buildGeneration(s: AppState, today: ISODate): Partial<AppState>` — the single generation body shared by `checkDayTick`'s expiry branch, `regenerateFortnight`, and `initApp`'s dangling-id recovery.
- Public action signatures unchanged: `checkDayTick: () => void`, `regenerateFortnight: () => void` (the 9 test files using `regenerateFortnight` as a read-only fixture keep compiling and passing).

**Steps:**

- [ ] **Write the failing store tests.** In `src/store/dayTick.test.ts`, change the top of the file (lines 1–7) from
  ```ts
  import { useAppStore } from './store';

  const clock = { today: '2026-08-18' };
  vi.mock('./clock', () => ({
    todayLocal: () => clock.today,
    nowIso: () => `${clock.today}T12:00:00.000Z`,
  }));
  ```
  to
  ```ts
  import { useAppStore } from './store';
  import type { Fortnight, PersistedState } from '../domain/types';

  const clock = { today: '2026-08-18' };
  vi.mock('./clock', () => ({
    todayLocal: () => clock.today,
    nowIso: () => `${clock.today}T12:00:00.000Z`,
  }));
  ```
  and append at the end of the file (after line 105):

  ```ts
  describe('automatic month generation (checkDayTick expiry branch)', () => {
    beforeEach(reset);

    function pastPeriod(id: string, days: string[]): Fortnight {
      return { id, startDay: days[0], days, createdAt: `${days[0]}T09:00:00.000Z` };
    }
    const mayDays = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];
    const juneDays = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];
    const julyDays = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];
    const aprilDays = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];

    it('auto-generates the next month on the first tick after the active month ends, carrying pending work', () => {
      useAppStore.getState().addTodo({ title: 'pending', priority: 'high', scheduledDay: '2026-08-18' });
      useAppStore.getState().addTodo({ title: 'shipped', priority: 'low', scheduledDay: '2026-08-18' });
      const shipped = Object.values(useAppStore.getState().todos).find((t) => t.title === 'shipped')!;
      useAppStore.getState().toggleDone(shipped.id);
      useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'open blocker' });
      useAppStore.getState().addNote({ day: '2026-08-18', category: 'blocker', text: 'closed blocker' });
      const closed = Object.values(useAppStore.getState().notes).find((n) => n.text === 'closed blocker')!;
      useAppStore.getState().resolveBlocker(closed.id);
      const oldId = useAppStore.getState().activeFortnightId!;

      clock.today = '2026-09-01';
      useAppStore.getState().checkDayTick();

      const s = useAppStore.getState();
      expect(s.fortnights).toHaveLength(2);
      expect(s.activeFortnightId).not.toBe(oldId);
      const active = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
      expect(active.days[0]).toBe('2026-09-01');
      expect(s.viewedFortnightId).toBe(s.activeFortnightId);
      expect(s.selectedDay).toBe('2026-09-01');
      const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
      expect(pending).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-09-01', rolledOver: true });
      expect(Object.values(s.todos).find((t) => t.title === 'shipped')!.fortnightId).toBe(oldId);
      const open = Object.values(s.notes).find((n) => n.text === 'open blocker')!;
      expect(open).toMatchObject({ fortnightId: s.activeFortnightId, day: '2026-09-01', rolledOver: true });
      expect(Object.values(s.notes).find((n) => n.text === 'closed blocker')!.fortnightId).toBe(oldId);
    });

    it('the generating tick stamps lastRolloverDay; a same-day second tick moves nothing (the INV-5 hazard)', () => {
      useAppStore.getState().addTodo({ title: 'pending', priority: 'low', scheduledDay: '2026-08-18' });
      clock.today = '2026-09-01';
      useAppStore.getState().checkDayTick();
      const s1 = useAppStore.getState();
      expect(s1.fortnights).toHaveLength(2); // generation happened...
      expect(s1.lastRolloverDay).toBe('2026-09-01'); // ...and stamped the latch in the same set()

      const snapshot = {
        fortnights: s1.fortnights, activeFortnightId: s1.activeFortnightId,
        todos: s1.todos, notes: s1.notes, lastRolloverDay: s1.lastRolloverDay,
        viewedFortnightId: s1.viewedFortnightId, selectedDay: s1.selectedDay,
      };
      useAppStore.getState().checkDayTick(); // interval + focus + visibilitychange can all fire same-day
      const s2 = useAppStore.getState();
      expect({
        fortnights: s2.fortnights, activeFortnightId: s2.activeFortnightId,
        todos: s2.todos, notes: s2.notes, lastRolloverDay: s2.lastRolloverDay,
        viewedFortnightId: s2.viewedFortnightId, selectedDay: s2.selectedDay,
      }).toEqual(snapshot);
    });

    it('does not generate twice even with the latch stripped (idempotence rests on a fresh month never being expired)', () => {
      clock.today = '2026-09-01';
      useAppStore.getState().checkDayTick();
      const generated = useAppStore.getState().activeFortnightId;
      useAppStore.setState({ lastRolloverDay: null }); // strip the latch entirely
      useAppStore.getState().checkDayTick();
      const s = useAppStore.getState();
      expect(s.activeFortnightId).toBe(generated);
      expect(s.fortnights).toHaveLength(2);
    });

    it('generates even when lastRolloverDay is already today, if the active month has expired (imported-backup case)', () => {
      // Replace the active month's days with an entirely-past July range,
      // keeping its id, then pretend rollover already ran today.
      const activeId = useAppStore.getState().activeFortnightId!;
      useAppStore.setState({
        fortnights: useAppStore.getState().fortnights.map((f) =>
          f.id === activeId ? { ...f, startDay: julyDays[0], days: julyDays } : f,
        ),
        lastRolloverDay: '2026-08-18',
      });
      useAppStore.getState().checkDayTick();
      const s = useAppStore.getState();
      expect(s.fortnights).toHaveLength(2);
      expect(s.activeFortnightId).not.toBe(activeId);
    });

    it('a months-long gap generates exactly one new month and keeps the last actually-used months (no ghost months)', () => {
      useAppStore.getState().addTodo({ title: 'pending', priority: 'low', scheduledDay: '2026-08-18' });
      clock.today = '2026-11-16';
      useAppStore.getState().checkDayTick();
      const s = useAppStore.getState();
      expect(s.fortnights).toHaveLength(2); // August + November -- no September/October ghosts
      expect(s.fortnights.map((f) => f.days[0].slice(0, 7))).toEqual(['2026-08', '2026-11']);
      const pending = Object.values(s.todos).find((t) => t.title === 'pending')!;
      expect(pending).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-11-16', rolledOver: true });
    });

    it('re-points the view when the viewed month is pruned, instead of blanking the app', () => {
      const active = useAppStore.getState().fortnights[0];
      const may = pastPeriod('p-may', mayDays);
      const june = pastPeriod('p-jun', juneDays);
      const july = pastPeriod('p-jul', julyDays);
      useAppStore.setState({
        fortnights: [may, june, july, active],
        todos: {
          old: {
            id: 'old', fortnightId: 'p-may', title: 'ancient', priority: 'low',
            scheduledDay: '2026-05-04', done: true, completedAt: '2026-05-04T15:00:00.000Z',
            createdAt: '2026-05-04T09:00:00.000Z', rolledOver: false,
          },
        },
      });
      useAppStore.getState().viewFortnight('p-may'); // parked on the oldest month

      clock.today = '2026-09-01';
      useAppStore.getState().checkDayTick();

      const s = useAppStore.getState();
      // September generated; retained months are Jul/Aug/Sep -- May and June pruned.
      expect(s.fortnights.map((f) => f.id)).toEqual(['p-jul', active.id, s.activeFortnightId]);
      expect(s.todos.old).toBeUndefined();
      expect(s.viewedFortnightId).toBe(s.activeFortnightId);
      expect(s.selectedDay).toBe('2026-09-01');
      expect(s.announcement).toContain('removed from history');
    });

    it('keeps the view parked on a RETAINED past month across auto-generation', () => {
      const active = useAppStore.getState().fortnights[0];
      const july = pastPeriod('p-jul', julyDays);
      useAppStore.setState({ fortnights: [july, active] });
      useAppStore.getState().viewFortnight('p-jul');

      clock.today = '2026-09-01';
      useAppStore.getState().checkDayTick();

      const s = useAppStore.getState();
      expect(s.activeFortnightId).not.toBe(active.id); // generation happened
      expect(s.viewedFortnightId).toBe('p-jul');        // view untouched
      expect(s.selectedDay).toBe('2026-07-06');         // still parked where the user was
    });

    it('importState with more than 3 months of history does not prune (pruning only runs at generation)', () => {
      const s0 = useAppStore.getState();
      const active = s0.fortnights[0];
      const snapshot: PersistedState = {
        schemaVersion: s0.schemaVersion,
        fortnights: [
          pastPeriod('p-apr', aprilDays), pastPeriod('p-may', mayDays),
          pastPeriod('p-jun', juneDays), pastPeriod('p-jul', julyDays), active,
        ],
        activeFortnightId: active.id,
        todos: {}, notes: {},
        lastRolloverDay: '2026-08-18',
        pomodoroSettings: s0.pomodoroSettings,
      };
      useAppStore.getState().importState(snapshot);
      expect(useAppStore.getState().fortnights).toHaveLength(5);
    });

    it('importState with an expired active month and lastRolloverDay === today generates immediately (expiry beats the latch)', () => {
      const s0 = useAppStore.getState();
      const snapshot: PersistedState = {
        schemaVersion: s0.schemaVersion,
        fortnights: [pastPeriod('p-jul', julyDays)],
        activeFortnightId: 'p-jul',
        todos: {
          stuck: {
            id: 'stuck', fortnightId: 'p-jul', title: 'stranded', priority: 'low',
            scheduledDay: '2026-07-10', done: false,
            createdAt: '2026-07-06T09:00:00.000Z', rolledOver: false,
          },
        },
        notes: {},
        lastRolloverDay: '2026-08-18', // === mocked today: the latch alone would block forever
        pomodoroSettings: s0.pomodoroSettings,
      };
      useAppStore.getState().importState(snapshot);
      const s = useAppStore.getState();
      expect(s.fortnights).toHaveLength(2);
      expect(s.activeFortnightId).not.toBe('p-jul');
      const stuck = Object.values(s.todos).find((t) => t.title === 'stranded')!;
      expect(stuck).toMatchObject({ fortnightId: s.activeFortnightId, scheduledDay: '2026-08-18', rolledOver: true });
    });
  });
  ```

- [ ] **See them fail:** `npx vitest run src/store/dayTick.test.ts` — the two existing `describe`s stay green; the new one fails. Expected shape of the failures: the auto-generation tests fail on `expect(s.fortnights).toHaveLength(2)` with `expected 2, received 1` (old code takes the rollover path, which no-ops on an expired month); the imported-backup tests fail the same way (old latch early-returns). One test — "importState with more than 3 months does not prune" — is a deliberate *characterization* test and is expected green immediately; it pins the no-pruning-on-import behavior against regressions.

- [ ] **Implement.** Six edits to `src/store/store.ts`:

  **(1)** Line 6, change
  ```ts
  import { generateMonthDays, effectiveBoardDay, carryOverTodos, carryOverNotes } from '../domain/fortnight';
  ```
  to
  ```ts
  import {
    generateMonthDays, effectiveBoardDay, carryOverTodos, carryOverNotes, pruneToRetention,
  } from '../domain/fortnight';
  ```
  (Do **not** import `selectFortnightExpired` here — that would be a runtime import cycle with `selectors.ts`; expiry is computed inline with `effectiveBoardDay(active, today) === null`.)

  **(2)** Lines 45–47 (stale plan-reference comments), change
  ```ts
    initApp: () => void;
    checkDayTick: () => void;          // implemented in Task 12
    regenerateFortnight: () => void;   // implemented in Task 12
  ```
  to
  ```ts
    initApp: () => void;
    /** The single month-transition pipeline: same-day no-op, daily rollover,
     *  and (when the active month has ended) automatic generation + pruning. */
    checkDayTick: () => void;
    /** Internal safety valve + shared test fixture. No UI door since the
     *  three-month-window redesign -- generation is automatic in checkDayTick. */
    regenerateFortnight: () => void;
  ```

  **(3)** After `buildFortnight` (lines 75–78), insert:
  ```ts
  /** Shared generation body for checkDayTick's automatic month transition,
   *  the internal regenerateFortnight safety valve, and initApp's dangling-id
   *  recovery. Builds the new month from `today`, carries pending todos /
   *  unresolved blockers over (INV-5's carry-over half -- done todos and
   *  resolved blockers stay pinned to their month), prunes history to the
   *  3-month retention window, and stamps lastRolloverDay in the SAME set()
   *  (INV-5: without it, a same-day second tick would run applyRollover over
   *  todos carryOverTodos just placed on future overlap days and yank them
   *  back to today). The view follows the new active month when the user was
   *  on the old active month or on a month that just got pruned; a view
   *  parked on a retained past month is left alone. */
  function buildGeneration(s: AppState, today: ISODate): Partial<AppState> {
    const oldId = s.activeFortnightId;
    const fn = buildFortnight(today);
    const carriedTodos = oldId ? carryOverTodos(s.todos, oldId, fn, today) : s.todos;
    const carriedNotes = oldId ? carryOverNotes(s.notes, oldId, fn, today) : s.notes;
    const pruned = pruneToRetention([...s.fortnights, fn], carriedTodos, carriedNotes, today);
    const viewedSurvives =
      s.viewedFortnightId !== null
      && s.viewedFortnightId !== oldId
      && pruned.fortnights.some((f) => f.id === s.viewedFortnightId);
    return {
      fortnights: pruned.fortnights,
      activeFortnightId: fn.id,
      todos: pruned.todos,
      notes: pruned.notes,
      lastRolloverDay: today,
      viewedFortnightId: viewedSurvives ? s.viewedFortnightId : fn.id,
      selectedDay: viewedSurvives ? s.selectedDay : effectiveBoardDay(fn, today),
      // Pruning is silent by product decision, except for this one polite
      // live-region announcement (spec 2026-08-11 §4).
      ...(pruned.fortnights.length < s.fortnights.length + 1
        ? { announcement: 'Oldest month removed from history' }
        : {}),
    };
  }
  ```

  **(4)** Replace `checkDayTick` (lines 163–183) with:
  ```ts
          checkDayTick: () => {
            const today = todayLocal();
            const s = get();
            if (!s.activeFortnightId) return; // first run is initApp's job
            const found = s.fortnights.find((f) => f.id === s.activeFortnightId);
            // Expiry is evaluated BEFORE the lastRolloverDay latch: an
            // imported backup can carry lastRolloverDay === today with an
            // already-expired active month, and with no manual "Generate new
            // month" button left, the latch alone would block generation
            // forever. No loop risk: generateMonthDays rolls weekend-tail
            // anchors forward, so a freshly generated month is never expired
            // and a same-day re-evaluation lands in the latch below instead.
            if (found && effectiveBoardDay(found, today) === null) {
              set(buildGeneration(s, today));
              return;
            }
            if (s.lastRolloverDay === today) return;
            const wasViewingActive = s.viewedFortnightId === s.activeFortnightId;
            const active = found ?? buildFortnight(today);
            const fortnights = found ? s.fortnights : [...s.fortnights, active];
            const { todos } = applyRollover(s.todos, active, today);
            const { notes } = applyNoteRollover(s.notes, active, today);
            const effective = effectiveBoardDay(active, today);
            set({
              fortnights,
              activeFortnightId: active.id,
              todos,
              notes,
              lastRolloverDay: today,
              selectedDay: wasViewingActive && effective !== null ? effective : s.selectedDay,
              viewedFortnightId: wasViewingActive ? active.id : s.viewedFortnightId,
            });
          },
  ```
  The two branches stay **disjoint** (INV-5): the expired branch runs *only* carry-over (inside `buildGeneration`); the non-expired branch runs *only* rollover — `applyRollover` would be a no-op on an expired month anyway, but it never even gets called there.

  **(5)** Replace `regenerateFortnight` (lines 185–201) with:
  ```ts
          regenerateFortnight: () => {
            set(buildGeneration(get(), todayLocal()));
          },
  ```

  **(6)** Replace `initApp`'s else-branch (lines 145–160) — currently:
  ```ts
            } else {
              get().checkDayTick();
              const s = get();
              let active = s.fortnights.find((f) => f.id === s.activeFortnightId);
              if (!active) {
                // Defense-in-depth: activeFortnightId doesn't resolve to any
                // fortnight (e.g. corrupted state from a future migration bug).
                // Recover instead of crashing the whole app at module scope.
                active = buildFortnight(today);
                set({ fortnights: [...s.fortnights, active], activeFortnightId: active.id });
              }
              set({
                viewedFortnightId: active.id,
                selectedDay: s.selectedDay ?? effectiveBoardDay(active, today) ?? active.days[0],
              });
            }
  ```
  with:
  ```ts
            } else {
              get().checkDayTick();
              const s = get();
              if (!s.fortnights.some((f) => f.id === s.activeFortnightId)) {
                // Defense-in-depth: activeFortnightId doesn't resolve to any
                // fortnight (e.g. corrupted state from a future migration bug).
                // Recover through the same generation pipeline as checkDayTick's
                // expiry branch -- it also rescues todos/notes still keyed to
                // the dangling id (carry-over keys on the old active id) and
                // stamps lastRolloverDay (INV-5).
                set(buildGeneration(s, today));
              }
              const after = get();
              const active = after.fortnights.find((f) => f.id === after.activeFortnightId);
              if (!active) return; // unreachable: buildGeneration installs its month as active
              set({
                viewedFortnightId: active.id,
                selectedDay: after.selectedDay ?? effectiveBoardDay(active, today) ?? active.days[0],
              });
            }
  ```
  This is the spec's low-priority "route the recovery branch through the same helper" item — included because it is a two-line change that also removes the branch's todo-stranding gap, and `store.test.ts`'s two dangling-id tests (lines 60–89) pass under it unchanged (verify in the next step).

- [ ] **See them pass:** `npx vitest run src/store/dayTick.test.ts src/store/store.test.ts src/store/storePersistence.test.ts` — all green. Pay attention to `store.test.ts`'s "initApp recovers … dangling" tests and `storePersistence.test.ts`'s rehydration-guard test (INV-7 must stay intact: `initApp` still early-returns on `rehydrationError` before any tick — that guard, line 134, is untouched).
- [ ] **Full gate:** `npm run verify` — green. The 9 files using `regenerateFortnight` as a fixture (notes/todos/reminders/commands/useShortcuts/store/App tests) all regenerate a same-month period while viewing the active month, where `buildGeneration` reproduces the old behavior exactly (nothing pruned — same calendar month; view re-pointed — user was on active).
- [ ] **Commit:** `git add src/store/store.ts src/store/dayTick.test.ts && git commit -m "feat: auto-generate the next month in checkDayTick, prune history to the retention window" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 3: App surgery — remove the manual generate flow (button, dialog, banner, palette action)

Ordering note: this runs **before** the `FortnightNav` swap (Task 4) so the suite is green at every task boundary — `history.test.tsx`'s dropdown-based tests keep passing here because `FortnightSwitcher` stays; only the button/dialog flow (whose tests are deleted/rewritten in this task) goes away.

**Files:**
- Modify: `src/App.test.tsx` (add one gone-assertion test; existing tests untouched — the progress-indicator test at lines 73–85 keeps compiling because `regenerateFortnight` survives)
- Modify: `src/components/commands/commands.test.tsx` (replace the palette-gating test at lines 52–75)
- Modify: `src/components/history/history.test.tsx` (delete the dialog/button tests at lines 36–46, 48–59, 83–86, 88–92; rewrite the read-only test at lines 61–81 onto the store action; keep the mixed-history test at lines 94–133 verbatim)
- Modify: `src/App.tsx` (deletions at lines 5, 14, 27, 30, 54–61, 80–86, 100–102, 109–117)
- Modify: `src/store/selectors.ts` (delete `selectFortnightExpired`, lines 65–68, and its now-unused imports, lines 2–3)
- Delete: `src/components/common/ConfirmDialog.tsx`, `src/components/common/ConfirmDialog.module.css` (zero consumers after the App edit)

**Interfaces:**
- Removes: `selectFortnightExpired(s: AppState): boolean` (all 4 call sites are in `App.tsx` and all go away) and the `ConfirmDialog` component.
- Everything else unchanged.

**Steps:**

- [ ] **Write the failing gone-assertions first.** Append to the `App shell` describe in `src/App.test.tsx` (after the progress-indicator test, line 85):
  ```ts
    it('an expired active month renders no banner and no Generate button -- month transitions are automatic now', () => {
      // Expire the active period in place (legacy July range, id preserved).
      const activeId = useAppStore.getState().activeFortnightId!;
      const days = [
        '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
        '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
      ];
      useAppStore.setState({
        fortnights: useAppStore.getState().fortnights.map((f) =>
          f.id === activeId ? { ...f, startDay: days[0], days } : f,
        ),
      });
      render(<App />);
      expect(screen.queryByText(/This month has ended/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Generate new month' })).not.toBeInTheDocument();
    });
  ```
  And in `src/components/commands/commands.test.tsx`, replace the entire test `'excludes "Generate new month" until the active period has ended, then includes it'` (lines 52–75) with:
  ```ts
    it('never lists "Generate new month" -- month transitions are automatic now', async () => {
      const user = userEvent.setup();
      // Even with the active period expired (the only state that used to
      // surface the action), the palette must not offer it.
      const activeId = useAppStore.getState().activeFortnightId!;
      const days = [
        '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
        '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
      ];
      useAppStore.setState({
        fortnights: useAppStore.getState().fortnights.map((f) =>
          f.id === activeId ? { ...f, startDay: days[0], days } : f,
        ),
      });
      render(<App />);
      await user.keyboard('{Control>}k{/Control}');
      expect(screen.getByRole('listbox', { name: 'Results' })).not.toHaveTextContent('Generate new month');
    });
  ```
  (Rendering doesn't auto-generate here: `useDayChangeWatcher` only ticks on a 60s interval / focus / visibilitychange, and `seedApp()` already ran `initApp` before the fixture was expired — so the expired state is stable for the assertion.)

- [ ] **See them fail:** `npx vitest run src/App.test.tsx src/components/commands/commands.test.tsx` — the new App test fails on the button assertion (`Generate new month` is in the document), the new commands test fails on `toHaveTextContent` (the palette lists the action).

- [ ] **Rewrite the obsolete `history.test.tsx` tests** (green before *and* after the App surgery — the dropdown survives until Task 4). Replace the full contents of `src/components/history/history.test.tsx` with:
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

  // Overwrite the seeded active fortnight (Aug 3-31, not expired against the
  // mocked "today" of 2026-08-18) with a legacy July 13-24 date range,
  // entirely in the past, while keeping its id so activeFortnightId /
  // viewedFortnightId stay valid. Regeneration is then driven through the
  // internal store action -- the UI door (button + confirm dialog) was
  // removed by the three-month-window redesign.
  function expireActiveFortnight() {
    const activeId = useAppStore.getState().activeFortnightId!;
    const days = [
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
    ];
    useAppStore.setState({
      fortnights: useAppStore.getState().fortnights.map((f) =>
        f.id === activeId ? { ...f, startDay: days[0], days } : f,
      ),
    });
  }

  describe('history', () => {
    beforeEach(() => seedApp());

    it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
      expireActiveFortnight();
      const user = userEvent.setup();
      useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-07-24' });
      const t = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
      useAppStore.getState().regenerateFortnight(); // internal action -- no UI door anymore
      render(<App />);

      const oldOption = screen.getAllByRole('option').find((o) => !o.textContent!.includes('current'))!;
      await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), oldOption);
      expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
      // Selecting the old fortnight opens on its first day (Jul 13), which
      // expands the Jul 13-17 week -- Jul 24 lives in the folded Jul 20-24
      // week and needs a click to expand before its chip exists.
      await user.click(screen.getByRole('button', { name: /^20–24 — / }));
      await user.click(screen.getByRole('button', { name: /Fri, Jul 24/ }));
      expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
    });

    it('mixed history: a legacy 10-day fortnight coexists with the active calendar month', async () => {
      // Simulates history from before the monthly-board redesign: a hand-built
      // 10-workday legacy fortnight (Jul 13-24 2026) sitting alongside the
      // active calendar-month period seedApp() just created (Aug 3-31 2026).
      const user = userEvent.setup();
      const active = useAppStore.getState().fortnights[0];
      const legacy = {
        id: 'legacy-jul',
        startDay: '2026-07-13',
        days: [
          '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
          '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
        ],
        createdAt: '2026-07-13T12:00:00.000Z',
      };
      useAppStore.setState({ fortnights: [legacy, active] });
      render(<App />);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options.map((o) => o.textContent)).toEqual([
        'Mon, Aug 3 – Mon, Aug 31 (current)',
        'Mon, Jul 13 – Fri, Jul 24',
      ]);

      await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), legacy.id);
      expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();

      // Legacy period has no "today"; selecting it opens on days[0] (Jul 13),
      // so the week containing it (Jul 13-17) expands and the other (Jul
      // 20-24) folds -- same accordion contract as the active month.
      const dayChips = screen.getAllByRole('button', { name: /^[A-Z][a-z]{2} \d+ — / });
      expect(dayChips).toHaveLength(5);
      const weeksWrapper = screen.getByRole('navigation', { name: 'Month days' }).firstElementChild!;
      expect(weeksWrapper.children).toHaveLength(2); // one child per week, contract preserved

      const foldedWeek = screen.getByRole('button', { name: /^20–24 — / });
      await user.click(foldedWeek);
      expect(screen.getAllByRole('button', { name: /^Mon 20 — / })).toHaveLength(1);
    });
  });
  ```
  Run `npx vitest run src/components/history/history.test.tsx` — green (still against the pre-surgery App: the store action replaces the button clicks, the dropdown is still rendered).

- [ ] **Perform the App surgery.** Seven edits to `src/App.tsx`:

  **(1)** Line 5:
  ```tsx
  import { selectViewedFortnight, selectFortnightExpired, selectIsReadOnly } from './store/selectors';
  ```
  →
  ```tsx
  import { selectViewedFortnight, selectIsReadOnly } from './store/selectors';
  ```

  **(2)** Lines 13–15, remove the `ConfirmDialog` import:
  ```tsx
  import { ThemeToggle } from './components/common/ThemeToggle';
  import { ConfirmDialog } from './components/common/ConfirmDialog';
  import { Announcer } from './components/common/Announcer';
  ```
  →
  ```tsx
  import { ThemeToggle } from './components/common/ThemeToggle';
  import { Announcer } from './components/common/Announcer';
  ```

  **(3)** Lines 27–30, remove the action binding and dialog state:
  ```tsx
    const regenerateFortnight = useAppStore((s) => s.regenerateFortnight);
    const setComposeIntent = useAppStore((s) => s.setComposeIntent);
    const [standupOpen, setStandupOpen] = useState(false);
    const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  ```
  →
  ```tsx
    const setComposeIntent = useAppStore((s) => s.setComposeIntent);
    const [standupOpen, setStandupOpen] = useState(false);
  ```

  **(4)** Lines 51–62, remove the palette action (keep the pomodoro comment):
  ```tsx
      // Not board mutation, so no read-only gate — the timer works while
      // viewing a past fortnight.
      { id: 'pomodoro', label: 'Pomodoro timer', run: () => setPomodoroOpen(true) },
      // Excludes generating a new month until the active one has actually
      // ended -- doing it mid-month would create a second period covering the
      // same date range as the active one, indistinguishable in the history
      // switcher except for the "(current)" suffix, and would strand any
      // already-completed todos in the newly-inactive copy.
      ...(selectFortnightExpired(state) ? [
        { id: 'generate-fortnight', label: 'Generate new month', run: () => setConfirmRegenerateOpen(true) },
      ] : []),
      { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', run: () => setShortcutsOpen(true) },
  ```
  →
  ```tsx
      // Not board mutation, so no read-only gate — the timer works while
      // viewing a past fortnight.
      { id: 'pomodoro', label: 'Pomodoro timer', run: () => setPomodoroOpen(true) },
      { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', run: () => setShortcutsOpen(true) },
  ```

  **(5)** Lines 79–87, remove the header button:
  ```tsx
            <button className={styles.primaryAction} onClick={() => setStandupOpen(true)}>Standup</button>
            <button
              onClick={() => setConfirmRegenerateOpen(true)}
              disabled={!selectFortnightExpired(state)}
              title={selectFortnightExpired(state) ? undefined : 'Available once this month has ended'}
            >
              Generate new month
            </button>
            <FortnightSwitcher />
  ```
  →
  ```tsx
            <button className={styles.primaryAction} onClick={() => setStandupOpen(true)}>Standup</button>
            <FortnightSwitcher />
  ```

  **(6)** Lines 100–103, remove the expired banner:
  ```tsx
        {selectFortnightExpired(state) && (
          <p className={styles.banner} role="alert">This month has ended. Generate a new month to continue.</p>
        )}
        {selectIsReadOnly(state) && (
  ```
  →
  ```tsx
        {selectIsReadOnly(state) && (
  ```

  **(7)** Lines 108–118, remove the ConfirmDialog usage:
  ```tsx
        {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}
        {confirmRegenerateOpen && (
          <ConfirmDialog
            title="Generate new month?"
            message="Incomplete todos carry over automatically. This can't be undone."
            confirmLabel="Generate"
            onConfirm={() => { regenerateFortnight(); setConfirmRegenerateOpen(false); }}
            onCancel={() => setConfirmRegenerateOpen(false)}
          />
        )}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={paletteActions} />}
  ```
  →
  ```tsx
        {standupOpen && <StandupModal onClose={() => setStandupOpen(false)} />}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} actions={paletteActions} />}
  ```

- [ ] **Delete `selectFortnightExpired` from `src/store/selectors.ts`.** Remove the function (lines 65–68):
  ```ts
  export function selectFortnightExpired(s: AppState): boolean {
    const active = s.fortnights.find((f) => f.id === s.activeFortnightId);
    return active !== undefined && effectiveBoardDay(active, todayLocal()) === null;
  }
  ```
  and its now-unused imports — change lines 1–4 from
  ```ts
  import type { Fortnight, ISODate, Note, Todo } from '../domain/types';
  import { effectiveBoardDay } from '../domain/fortnight';
  import { todayLocal } from './clock';
  import type { AppState } from './store';
  ```
  to
  ```ts
  import type { Fortnight, ISODate, Note, Todo } from '../domain/types';
  import type { AppState } from './store';
  ```
  (`noUnusedLocals` would fail the typecheck otherwise — that's the guard telling you the deletion is complete.)

- [ ] **Delete the ConfirmDialog files** (zero consumers now):
  `git rm src/components/common/ConfirmDialog.tsx src/components/common/ConfirmDialog.module.css`

- [ ] **See everything pass:** `npm run verify` — green. The deleted coverage (dialog confirm/cancel/focus, button disabled/enabled, palette gating) is intentionally not replaced: the flow it covered no longer exists, and its product behavior (generation) is covered by Task 2's store tests. The ConfirmDialog focus-defaults-to-Cancel coverage goes with the component (spec §3).
- [ ] **Commit:** `git add -A && git commit -m "feat: remove the manual Generate-new-month flow (button, dialog, banner, palette action)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 4: `FortnightNav` month stepper replaces the `FortnightSwitcher` dropdown

**Files:**
- Modify: `src/domain/dates.test.ts` (append one test inside the `dates` describe, after the `formatWeekdayShort` test at lines 64–67; extend the import at lines 1–5)
- Modify: `src/domain/dates.ts` (add `formatMonthLabel` after `formatDayLabel`, line 51)
- Modify: `src/components/history/history.test.tsx` (full rewrite onto arrow navigation + new stepper tests)
- Create: `src/components/history/FortnightNav.tsx`, `src/components/history/FortnightNav.module.css`
- Modify: `src/App.tsx` (line 10 import; the `<FortnightSwitcher />` usage in the header)
- Delete: `src/components/history/FortnightSwitcher.tsx`, `src/components/history/FortnightSwitcher.module.css`

**Interfaces:**
- Produces: `formatMonthLabel(day: ISODate): string` (e.g. `'August 2026'` — sibling of `formatDayLabel`, so the component stays free of ad-hoc date formatting) and `FortnightNav(): ReactElement | null` (no props — reads the store like `FortnightSwitcher` did).
- Consumes: `viewFortnight(id)` **only** (INV-9 rule 2: no second door — it clears `composeIntent` and picks today for the active month / first day for past months, `store.ts` lines 266–282).

**Steps:**

- [ ] **Write the failing `formatMonthLabel` test.** In `src/domain/dates.test.ts`, change the import (lines 1–5) from
  ```ts
  import {
    toISODate, parseISODate, addDays, isWorkday, mondayOfWeek,
    previousWorkday, nextWorkday, localDateOf,
    firstOfMonth, firstOfNextMonth, chunkByWeek, formatWeekdayShort, dayOfMonth,
  } from './dates';
  ```
  to
  ```ts
  import {
    toISODate, parseISODate, addDays, isWorkday, mondayOfWeek,
    previousWorkday, nextWorkday, localDateOf,
    firstOfMonth, firstOfNextMonth, chunkByWeek, formatWeekdayShort, dayOfMonth,
    formatMonthLabel,
  } from './dates';
  ```
  and add after the `formatWeekdayShort` test (line 67):
  ```ts
    it('formatMonthLabel formats the month name and year', () => {
      expect(formatMonthLabel('2026-08-03')).toBe('August 2026');
      expect(formatMonthLabel('2026-12-31')).toBe('December 2026');
    });
  ```

- [ ] **See it fail:** `npx vitest run src/domain/dates.test.ts` — module-load error: `does not provide an export named 'formatMonthLabel'`.

- [ ] **Implement `formatMonthLabel`.** In `src/domain/dates.ts`, after `formatDayLabel` (line 51), add:
  ```ts
  export function formatMonthLabel(day: ISODate): string {
    return parseISODate(day).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  ```
  Run `npx vitest run src/domain/dates.test.ts` — green.

- [ ] **Write the failing component tests.** Replace the full contents of `src/components/history/history.test.tsx` with:
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

  // Overwrite the seeded active fortnight (Aug 3-31, not expired against the
  // mocked "today" of 2026-08-18) with a legacy July 13-24 date range,
  // entirely in the past, while keeping its id so activeFortnightId /
  // viewedFortnightId stay valid. Regeneration is then driven through the
  // internal store action -- the UI door (button + confirm dialog) was
  // removed by the three-month-window redesign.
  function expireActiveFortnight() {
    const activeId = useAppStore.getState().activeFortnightId!;
    const days = [
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
    ];
    useAppStore.setState({
      fortnights: useAppStore.getState().fortnights.map((f) =>
        f.id === activeId ? { ...f, startDay: days[0], days } : f,
      ),
    });
  }

  // A hand-built legacy 10-workday fortnight (pre-redesign shape, Jul 13-24
  // 2026) -- INV-4: legacy periods persist unmigrated and stay navigable.
  const legacyJuly = {
    id: 'legacy-jul',
    startDay: '2026-07-13',
    days: [
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17',
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
    ],
    createdAt: '2026-07-13T12:00:00.000Z',
  };

  describe('month navigation + history', () => {
    beforeEach(() => seedApp());

    it('renders with a single month: label with "(current)", both arrows disabled (the dropdown used to hide itself)', () => {
      render(<App />);
      expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    });

    it('steps one month back and forward, sorting periods chronologically whatever the array order', async () => {
      const user = userEvent.setup();
      const active = useAppStore.getState().fortnights[0];
      useAppStore.setState({ fortnights: [active, legacyJuly] }); // deliberately NOT chronological
      render(<App />);

      expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText('July 2026')).toBeInTheDocument();
      expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled(); // oldest bound

      await user.click(screen.getByRole('button', { name: 'Next month' }));
      expect(screen.getByText('August 2026 (current)')).toBeInTheDocument();
      // Returning to the current month selects TODAY (Aug 18), not day 1.
      expect(screen.getByRole('heading', { name: /Tue, Aug 18/ })).toBeInTheDocument();
    });

    it('history view is read-only: no Add todo button, no checkboxes enabled', async () => {
      expireActiveFortnight();
      const user = userEvent.setup();
      useAppStore.getState().addTodo({ title: 'old task', priority: 'low', scheduledDay: '2026-07-24' });
      const t = Object.values(useAppStore.getState().todos)[0];
      useAppStore.getState().toggleDone(t.id); // stays in old fortnight after regenerate
      useAppStore.getState().regenerateFortnight(); // internal action -- no UI door anymore
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText('Viewing a past month (read-only).')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
      // Stepping to the old fortnight opens on its first day (Jul 13), which
      // expands the Jul 13-17 week -- Jul 24 lives in the folded Jul 20-24
      // week and needs a click to expand before its chip exists.
      await user.click(screen.getByRole('button', { name: /^20–24 — / }));
      await user.click(screen.getByRole('button', { name: /Fri, Jul 24/ }));
      expect(screen.getByRole('checkbox', { name: 'old task' })).toBeDisabled();
    });

    it('stepping months clears an open compose form (INV-9)', async () => {
      const user = userEvent.setup();
      const active = useAppStore.getState().fortnights[0];
      useAppStore.setState({ fortnights: [legacyJuly, active] });
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add todo' }));
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('mixed history: a legacy 10-day fortnight coexists with the active calendar month', async () => {
      const user = userEvent.setup();
      const active = useAppStore.getState().fortnights[0];
      useAppStore.setState({ fortnights: [legacyJuly, active] });
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Previous month' }));

      // Legacy period has no "today"; stepping to it opens on days[0] (Jul
      // 13), so the week containing it (Jul 13-17) expands and the other
      // (Jul 20-24) folds -- same accordion contract as the active month.
      const dayChips = screen.getAllByRole('button', { name: /^[A-Z][a-z]{2} \d+ — / });
      expect(dayChips).toHaveLength(5);
      const weeksWrapper = screen.getByRole('navigation', { name: 'Month days' }).firstElementChild!;
      expect(weeksWrapper.children).toHaveLength(2); // one child per week, contract preserved

      const foldedWeek = screen.getByRole('button', { name: /^20–24 — / });
      await user.click(foldedWeek);
      expect(screen.getAllByRole('button', { name: /^Mon 20 — / })).toHaveLength(1);
    });
  });
  ```
  ("Only retained months reachable" needs no separate component test: the stepper renders exactly the store's `fortnights`, and Task 2's store tests pin that pruned months leave the store.)

- [ ] **See them fail:** `npx vitest run src/components/history/history.test.tsx` — every test fails with `Unable to find an accessible element with the role "button" and name "Previous month"` (or the single-month test's missing `August 2026 (current)` text).

- [ ] **Create the component.** `src/components/history/FortnightNav.tsx`:
  ```tsx
  import { useAppStore } from '../../store/store';
  import { formatMonthLabel } from '../../domain/dates';
  import styles from './FortnightNav.module.css';

  /** Month stepper replacing the old history dropdown: steps through stored
   *  periods in chronological order -- sorted by days[0], because array order
   *  is only append-order and tests deliberately violate it -- bounded by the
   *  retention window. Two legacy periods inside one month are each their own
   *  stop (distinct boards); the header's date range disambiguates them.
   *  Navigation goes through viewFortnight ONLY (INV-9: it refuses nothing
   *  here but clears composeIntent and picks today / first-day as the
   *  selected day -- no second door writes viewedFortnightId). Unlike the
   *  dropdown, this renders even with a single period (both arrows
   *  disabled) so the current month is always labeled. */
  export function FortnightNav() {
    const fortnights = useAppStore((s) => s.fortnights);
    const activeId = useAppStore((s) => s.activeFortnightId);
    const viewedId = useAppStore((s) => s.viewedFortnightId);
    const viewFortnight = useAppStore((s) => s.viewFortnight);

    const ordered = [...fortnights].sort((a, b) => a.days[0].localeCompare(b.days[0]));
    const index = ordered.findIndex((f) => f.id === viewedId);
    if (index === -1) return null; // pre-init only: nothing viewed yet

    return (
      <nav className={styles.nav} aria-label="Month navigation">
        <button
          className={styles.arrow}
          aria-label="Previous month"
          disabled={index === 0}
          onClick={() => viewFortnight(ordered[index - 1].id)}
        >
          ‹
        </button>
        <span className={styles.label}>
          {formatMonthLabel(ordered[index].days[0])}
          {ordered[index].id === activeId ? ' (current)' : ''}
        </span>
        <button
          className={styles.arrow}
          aria-label="Next month"
          disabled={index === ordered.length - 1}
          onClick={() => viewFortnight(ordered[index + 1].id)}
        >
          ›
        </button>
      </nav>
    );
  }
  ```
  `src/components/history/FortnightNav.module.css` (tokens only — INV-12):
  ```css
  .nav {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .arrow {
    font-size: var(--text-sm);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    line-height: 1;
  }

  .label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }
  ```
  (The `‹`/`›` glyphs are visual only; each button's accessible name comes wholly from `aria-label` — WCAG 2.5.3 label-in-name concerns text labels, and a punctuation glyph has none, so this doesn't repeat the FortnightTape " (today)" suffix pattern. The `nav` label `"Month navigation"` is distinct from the tape's `"Month days"`, keeping both `getByRole('navigation', ...)` queries unambiguous.)

- [ ] **Swap it into `src/App.tsx`.** Line 10:
  ```tsx
  import { FortnightSwitcher } from './components/history/FortnightSwitcher';
  ```
  →
  ```tsx
  import { FortnightNav } from './components/history/FortnightNav';
  ```
  and in the header:
  ```tsx
            <FortnightSwitcher />
  ```
  →
  ```tsx
            <FortnightNav />
  ```

- [ ] **Delete the dropdown:** `git rm src/components/history/FortnightSwitcher.tsx src/components/history/FortnightSwitcher.module.css`

- [ ] **See them pass:** `npx vitest run src/components/history/history.test.tsx src/App.test.tsx src/components/commands/commands.test.tsx` — green.
- [ ] **Full gate:** `npm run verify` — green.
- [ ] **Commit:** `git add -A && git commit -m "feat: replace the history dropdown with a month stepper (FortnightNav)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 5: docs + stale-comment cleanup, final gate

**Files:**
- Modify: `docs/TECH-DEBT.md` (TD-14 row, line 22; the FortnightSwitcher bullet under "Minor / cosmetic", line 33)
- Modify: `src/domain/fortnight.ts` (stale `adaptFortnightToMonth` doc comment, lines 100–105)
- Modify: `src/domain/types.ts` (stale `fortnights` field comment, line 54)
- Modify: `src/components/common/Modal.tsx` (stale `ConfirmDialog` reference in the `initialFocusRef` doc comment, lines 43–45)

**Interfaces:** none — comment/prose changes only; behavior and tests untouched.

**Steps:**

- [ ] **`docs/TECH-DEBT.md`:** In the TD-14 row (line 22), change the component list `` `FortnightTape`/`FortnightBoard`/`FortnightSwitcher` `` to `` `FortnightTape`/`FortnightBoard`/`FortnightNav` `` (the nav deliberately keeps the legacy prefix, so TD-14 still applies to it). Then delete the whole "Minor / cosmetic" bullet (line 33):
  ```
  - `src/components/history/FortnightSwitcher.tsx`: option labels include the weekday name (cosmetic, differs from the original plan's illustrative example); `value={viewedId ?? ''}` has no matching empty `<option>` (unreachable — `viewedFortnightId` is always set once a fortnight exists).
  ```
  (The component no longer exists; deleting the row is the CLAUDE.md-mandated bookkeeping for tech debt resolved as part of a feature.)

- [ ] **`src/domain/fortnight.ts`** lines 100–105, change
  ```ts
   *  Returns null when it must not apply:
   *  - no overlap between the old days and the new month (the user is
   *    returning months later — leave it expired, the banner + "Generate new
   *    month" flow handles that);
  ```
  to
  ```ts
   *  Returns null when it must not apply:
   *  - no overlap between the old days and the new month (the user is
   *    returning months later — leave it expired; the next checkDayTick
   *    auto-generates the following month and prunes history);
  ```

- [ ] **`src/domain/types.ts`** line 54, change
  ```ts
    fortnights: Fortnight[];            // chronological; last = active
  ```
  to
  ```ts
    fortnights: Fortnight[];            // last = active; bounded by the 3-month
                                        // retention window (pruneToRetention runs
                                        // at month generation). Append-order --
                                        // sort by days[0] for display.
  ```

- [ ] **`src/components/common/Modal.tsx`** lines 43–45, change
  ```ts
    /** Focused on open instead of the dialog container -- e.g. ConfirmDialog
     * defaults focus to Cancel rather than the (destructive) confirm action,
     * CommandPalette focuses its search input. */
  ```
  to
  ```ts
    /** Focused on open instead of the dialog container -- e.g.
     * CommandPalette focuses its search input. */
  ```

- [ ] **Final gate:** `npm run verify` — green, suite lands around 320–330 tests (baseline 314, ~5 deleted, ~20 added). Also run the invariant sweep the hook enforces, as a belt-and-braces check on the whole diff: `grep -rn "toISOString()\s*\.\s*\(slice\|substring\|substr\|split\)" src/` must return nothing.
- [ ] **Commit:** `git add -A && git commit -m "docs: clean up stale references to the manual generate flow and FortnightSwitcher" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 6: Full regression — real-browser end-to-end verification

**Files:** none created or modified (verification only; a screenshot may be saved under the session scratchpad, not the repo).

**Interfaces:**
- Consumes: the completed Tasks 1–5 (the app as shipped).
- Produces: a written pass/fail report; any failure reopens the offending task before Task 7 may start.

- [ ] **Full suite:** `npm run verify` — typecheck + entire test suite green, no skips.
- [ ] **Launch the app for real** using the project's `run-app` skill (dev server + Playwright). The jsdom suite cannot prove real `localStorage` persistence across reloads, so this pass is mandatory, not optional.
- [ ] **Smoke the new behavior in the browser:**
  - Fresh profile: app opens on the current month, stepper shows `‹ August 2026 ›` with "(current)", next arrow disabled; no "Generate new month" button anywhere; `⌘K` palette has no "Generate new month" action.
  - Seed localStorage with a 4-months-of-history document whose active month is expired (July active, today August): reload → app lands on an auto-generated August, pending todos carried to today, `done` todos still in July; history stepper reaches exactly 3 months (oldest pruned, its todos gone); no expired banner.
  - Navigate `‹` to a past month: read-only banner shows, Add todo/Add note absent; navigate `›` back to current: today's day is selected, not day 1.
- [ ] **Smoke the existing flows for regressions:** add/complete/delete a todo, add/resolve a blocker note, open Standup (`S`), run a Pomodoro phase from the header widget, Export then Import the backup file round-trip, toggle light/dark theme, reload mid-session and confirm state persisted.
- [ ] **Report:** summarize pass/fail per item above. On any failure: stop, reopen the responsible task, fix, re-run this task from the top.

---

## Task 7: README + CLAUDE.md documentation update

**Files:**
- Modify: `README.md` — line 16 ("carry into a newly generated month" — now automatic), line 20 (the "Read-only month history" bullet: "generate a new month any time; old ones stay browsable" → automatic monthly rollover + 3-month window + stepper navigation), line 11 (screenshot alt text if it mentions the dropdown/button), lines 85/107 (add this redesign's spec to the amended-by chains)
- Modify: `CLAUDE.md` — line 72 naming-note file list (`FortnightTape`/`FortnightBoard`/`FortnightSwitcher` → `FortnightNav`); Orientation paragraph if it references the manual generate flow; the "Where to look for what" spec list gains `2026-08-11-three-month-window-auto-rollover-design.md` as product authority for retention/auto-rollover/navigation; INV-5's prose keeps `regenerateFortnight` but should note it is now internal-only (no UI door) and that `checkDayTick`'s generation branch carries the same stamp-`lastRolloverDay` obligation

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1–5 (describe what IS, not what was planned).
- Produces: docs a fresh reader can trust; no stale references to the dropdown, the button, `ConfirmDialog`, or `selectFortnightExpired` anywhere in README/CLAUDE.md.

- [ ] **Sweep for stale references:** `grep -rn "Generate new month\|FortnightSwitcher\|ConfirmDialog\|selectFortnightExpired" README.md CLAUDE.md docs/TECH-DEBT.md` — every hit must be updated or consciously kept (TECH-DEBT rows were handled in Task 5; anything left needs a reason).
- [ ] **Update `README.md`** per the file list above: features section describes automatic month rollover, the fixed current+2 retention window with silent pruning, and `‹ Month ›` stepper navigation; keyboard table unchanged (no new shortcuts).
- [ ] **Update `CLAUDE.md`** per the file list above. Do not renumber invariants; amend prose in place.
- [ ] **Verify docs claims against code:** every file, function, and flag named in the edited passages exists (`FortnightNav.tsx`, `pruneToRetention`, `buildGeneration`); commands quoted are real.
- [ ] **Gate:** `npm run verify` — still green (docs-only change; the gate catches accidental source touches).
- [ ] **Commit:** `git add README.md CLAUDE.md && git commit -m "docs: describe automatic month rollover, 3-month retention, and stepper navigation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Spec coverage map (self-review)

| Spec item | Task |
|---|---|
| §1 retention model, month-keyed, legacy-honest, never-drops-active, >3-tolerant, byte-identical pass-through | 1 |
| §1 prune only at generation; viewed-month re-point in same `set()` | 2 |
| §1 `firstOfPrevMonth` "if the retention floor needs date arithmetic" | Not needed — retention is month-key string comparison (see "resolved spec tension" note) |
| §2 pipeline order (expiry before latch), latch stamp, disjoint branches, gap skip, `regenerateFortnight` kept internal, initApp recovery via helper, inline expiry / `selectFortnightExpired` deleted | 2 (deletion of the selector: 3) |
| §3 `FortnightNav` stepper, sorted by `days[0]`, `viewFortnight` only, bounds-disabled arrows, single-period render, "(current)" affix | 4 |
| §3 App deletions (button, dialog state, palette action, banner, `selectFortnightExpired` import), ConfirmDialog deleted | 3 |
| §4 no schema bump / no migration / no partialize change; no prune on import; INV-7 untouched; prune announced via live region | 2 (tested), 0 code needed for the non-changes |
| §5 test plan (deleted ~5, updated read-only/legacy, new domain/store/component/app-gone tests) | 1–4 |
| TECH-DEBT row, `adaptFortnightToMonth` comment, `types.ts` comment | 5 |
