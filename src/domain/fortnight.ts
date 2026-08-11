import type { Fortnight, ISODate, Todo } from './types';
import { addDays, firstOfMonth, firstOfNextMonth, isWorkday, mondayOfWeek, nextWorkday } from './dates';

export function generateFortnightDays(anchor: ISODate): ISODate[] {
  const monday = mondayOfWeek(anchor);
  const days: ISODate[] = [];
  for (const weekStart of [monday, addDays(monday, 7)]) {
    for (let i = 0; i < 5; i++) days.push(addDays(weekStart, i));
  }
  return days;
}

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
