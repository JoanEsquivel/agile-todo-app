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

export interface WorkloadSegment {
  id: string;
  priority: Todo['priority'];
  done: boolean;
}

/**
 * One pass over all todos, grouped by day, for the fortnight tape — which
 * needs every day's segments at once to render the whole strip, whatever its
 * length (a ~21-day calendar month for the active period, or a legacy
 * 10-day fortnight in history). Calling `selectTodosForDay` per day (as the
 * old chip strip did) means one filter+sort pass per day; this does the
 * equivalent work once regardless of how many days there are.
 *
 * A day with no todos is simply absent from the result rather than mapped
 * to `[]` — callers read it as `workload[day] ?? []`.
 */
export function selectDayWorkload(s: AppState, fortnightId: string): Record<ISODate, WorkloadSegment[]> {
  const byDay: Record<ISODate, WorkloadSegment[]> = {};
  for (const t of Object.values(s.todos)) {
    if (t.fortnightId !== fortnightId) continue;
    (byDay[t.scheduledDay] ??= []).push({ id: t.id, priority: t.priority, done: t.done });
  }
  for (const segments of Object.values(byDay)) {
    segments.sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.id.localeCompare(b.id),
    );
  }
  return byDay;
}

export function selectFortnightExpired(s: AppState): boolean {
  const active = s.fortnights.find((f) => f.id === s.activeFortnightId);
  return active !== undefined && effectiveBoardDay(active, todayLocal()) === null;
}
