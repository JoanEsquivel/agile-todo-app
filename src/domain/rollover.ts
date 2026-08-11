import type { Fortnight, ISODate, Note, Todo } from './types';
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

/** Sibling of applyRollover for blocker notes (INV-5 disjointness: keys on
 *  fortnightId, never writes it). Only unresolved blockers move -- info
 *  notes and resolved blockers stay put, since they carry no "still
 *  blocking" urgency and the standup already surfaces them regardless of
 *  day. */
export function applyNoteRollover(
  notes: Record<string, Note>,
  fortnight: Fortnight,
  today: ISODate,
): { notes: Record<string, Note>; changed: boolean } {
  const target = effectiveBoardDay(fortnight, today);
  if (target === null) return { notes, changed: false };
  let changed = false;
  const out: Record<string, Note> = { ...notes };
  for (const n of Object.values(notes)) {
    if (
      n.fortnightId !== fortnight.id
      || n.category !== 'blocker'
      || n.resolved
      || n.day >= today
    ) continue;
    out[n.id] = { ...n, day: target, rolledOver: true };
    changed = true;
  }
  return { notes: out, changed };
}
