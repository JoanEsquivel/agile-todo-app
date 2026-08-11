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

export function firstOfMonth(day: ISODate): ISODate {
  const d = parseISODate(day);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function firstOfNextMonth(day: ISODate): ISODate {
  const d = parseISODate(day);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

export function chunkByWeek(days: ISODate[]): ISODate[][] {
  const chunks: ISODate[][] = [];
  let currentWeek: ISODate | null = null;
  for (const day of days) {
    const week = mondayOfWeek(day);
    if (week !== currentWeek) {
      chunks.push([]);
      currentWeek = week;
    }
    chunks[chunks.length - 1].push(day);
  }
  return chunks;
}

export function formatWeekdayShort(day: ISODate): string {
  return parseISODate(day).toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayOfMonth(day: ISODate): number {
  return parseISODate(day).getDate();
}
