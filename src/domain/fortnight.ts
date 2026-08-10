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
