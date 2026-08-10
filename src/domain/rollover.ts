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
