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
  const todayLines = data.today.map((t) => (t.done ? `~${t.title}~` : t.title));
  return [
    section('Yesterday', data.yesterday.map((t) => t.title)),
    section('Today', todayLines),
    section('Blockers', data.blockers.map((n) => n.text)),
  ].join('\n\n');
}
