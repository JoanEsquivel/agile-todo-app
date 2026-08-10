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
