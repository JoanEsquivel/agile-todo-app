import type { Fortnight, ISODate, Note, Todo } from './types';
import { effectiveBoardDay } from './fortnight';
import { appendToDay, movedOrder } from './reorder';

export function applyRollover(
  todos: Record<string, Todo>,
  fortnight: Fortnight,
  today: ISODate,
): { todos: Record<string, Todo>; changed: boolean } {
  const target = effectiveBoardDay(fortnight, today);
  if (target === null) return { todos, changed: false };
  // Sorted BEFORE relocation: movedOrder keys on the original day/index.
  const moved = Object.values(todos)
    .filter((t) => t.fortnightId === fortnight.id && !t.done && t.scheduledDay < today)
    .sort(movedOrder);
  if (moved.length === 0) return { todos, changed: false };
  const out: Record<string, Todo> = { ...todos };
  for (const t of moved) out[t.id] = { ...t, scheduledDay: target, rolledOver: true };
  // Ordering policy (spec §2): what was already arranged on the target day
  // keeps its curated order; incoming todos queue behind, relative order kept.
  return { todos: appendToDay(out, moved.map((t) => t.id), fortnight.id, target), changed: true };
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
