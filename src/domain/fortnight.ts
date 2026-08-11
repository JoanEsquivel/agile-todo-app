import type { Fortnight, ISODate, Note, Todo } from './types';
import { addDays, firstOfMonth, firstOfNextMonth, isWorkday, nextWorkday } from './dates';

/** Workdays (Mon–Fri) of the calendar month containing `anchor`, ascending.
 *  If `anchor` falls AFTER the month's last workday (a weekend tail like
 *  Sat May 30 2026), returns the NEXT month's workdays instead — otherwise
 *  "Generate new month" on such a day would create an instantly-expired
 *  period and the regenerate flow would loop on it forever. */
export function generateMonthDays(anchor: ISODate): ISODate[] {
  const days = workdaysOfMonth(firstOfMonth(anchor));
  return anchor > days[days.length - 1]
    ? workdaysOfMonth(firstOfNextMonth(anchor))
    : days;
}

function workdaysOfMonth(monthFirstDay: ISODate): ISODate[] {
  const month = monthFirstDay.slice(0, 7);
  const days: ISODate[] = [];
  let d = monthFirstDay;
  while (d.slice(0, 7) === month) {
    if (isWorkday(d)) days.push(d);
    d = addDays(d, 1);
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

function sameDays(a: ISODate[], b: ISODate[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/** Reshape the ACTIVE fortnight in place to the calendar-month design used by
 *  schema v3 (`generateMonthDays`): same `id`/`createdAt` (history and
 *  done-todos stay attached — `fortnightId` never changes, so INV-5's
 *  migration cursor is untouched), `days` becomes `generateMonthDays(today)`.
 *
 *  Returns null when it must not apply:
 *  - no overlap between the old days and the new month (the user is
 *    returning months later — leave it expired, the banner + "Generate new
 *    month" flow handles that);
 *  - the days are already identical (idempotence — safe to re-run, e.g. via
 *    `parseBackup` on an already-migrated document). */
export function adaptFortnightToMonth(
  fortnight: Fortnight,
  todos: Record<string, Todo>,
  notes: Record<string, Note>,
  today: ISODate,
): { fortnight: Fortnight; todos: Record<string, Todo>; notes: Record<string, Note> } | null {
  const newDays = generateMonthDays(today);
  if (!fortnight.days.some((d) => newDays.includes(d))) return null; // no overlap: leave expired
  if (sameDays(fortnight.days, newDays)) return null; // already adapted

  const adapted: Fortnight = { ...fortnight, startDay: newDays[0], days: newDays };
  // `??` is unreachable given the overlap check above, but avoids a `!`.
  const target = effectiveBoardDay(adapted, today) ?? newDays[0];

  const outTodos: Record<string, Todo> = { ...todos };
  for (const t of Object.values(todos)) {
    if (t.fortnightId !== fortnight.id) continue; // other fortnights: untouched
    if (newDays.includes(t.scheduledDay)) continue; // still lands inside the new month
    // Same relocation as carryOverTodos' else branch (fortnight.ts, above) —
    // but this NEVER writes fortnightId (that's what keeps this a reshape,
    // not a migration, and keeps INV-5's cursor intact). Unlike
    // carryOverTodos, `done` todos are relocated too (conserving `done`/
    // `completedAt`, and leaving `rolledOver` untouched) rather than
    // excluded, so a completed todo doesn't become permanently invisible
    // just because it fell outside the reshaped month.
    outTodos[t.id] = {
      ...t,
      scheduledDay: target,
      rolledOver: t.done ? t.rolledOver : (t.scheduledDay < today ? true : t.rolledOver),
    };
  }

  const outNotes: Record<string, Note> = { ...notes };
  for (const n of Object.values(notes)) {
    if (n.fortnightId !== fortnight.id) continue; // other fortnights: untouched
    if (newDays.includes(n.day)) continue; // still lands inside the new month
    // Mandatory, not an edge case: an unresolved blocker note left on a day
    // outside the reshaped month would be invisible on the board but still
    // shown forever in the standup, with no way to resolve or delete it —
    // the same orphan hole INV-9 exists to close.
    outNotes[n.id] = { ...n, day: target };
  }

  return { fortnight: adapted, todos: outTodos, notes: outNotes };
}
