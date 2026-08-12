import type { ISODate, Priority, Todo } from './types';

/** Absent sortIndex sorts last — the selector and every band operation
 *  share this rule, which is what lets legacy (never-reordered) data mix
 *  safely with indexed data. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

/** A band = the PENDING todos sharing (fortnightId, scheduledDay, priority),
 *  in display order. Done todos are never part of any band. */
function bandMembers(
  todos: Record<string, Todo>,
  fortnightId: string,
  day: ISODate,
  priority: Priority,
): Todo[] {
  return Object.values(todos)
    .filter((t) =>
      t.fortnightId === fortnightId && t.scheduledDay === day
      && t.priority === priority && !t.done)
    .sort((a, b) =>
      (a.sortIndex ?? UNRANKED) - (b.sortIndex ?? UNRANKED)
      || a.createdAt.localeCompare(b.createdAt));
}

/** Rewrites a band's sortIndexes to contiguous 0..n-1 in current display
 *  order. Every band-touching operation runs this first. Returns the input
 *  record untouched when nothing needs rewriting. */
export function normalizeBand(
  todos: Record<string, Todo>,
  fortnightId: string,
  day: ISODate,
  priority: Priority,
): Record<string, Todo> {
  const members = bandMembers(todos, fortnightId, day, priority);
  if (members.every((t, i) => t.sortIndex === i)) return todos;
  const out = { ...todos };
  members.forEach((t, i) => { out[t.id] = { ...t, sortIndex: i }; });
  return out;
}

/** The one user-facing operation (spec §2): move a pending todo to
 *  (targetPriority, targetIndex) within its own day. Clamps the index,
 *  writes `priority` on a band change, re-indexes both bands. No-op for
 *  done/unknown ids. */
export function reorderTodo(
  todos: Record<string, Todo>,
  id: string,
  targetPriority: Priority,
  targetIndex: number,
): Record<string, Todo> {
  const todo = todos[id];
  if (!todo || todo.done) return todos;
  let out = normalizeBand(todos, todo.fortnightId, todo.scheduledDay, todo.priority);
  if (todo.priority !== targetPriority) {
    out = normalizeBand(out, todo.fortnightId, todo.scheduledDay, targetPriority);
  }
  const band = bandMembers(out, todo.fortnightId, todo.scheduledDay, targetPriority)
    .filter((t) => t.id !== id);
  const clamped = Math.max(0, Math.min(targetIndex, band.length));
  band.splice(clamped, 0, out[id]);
  out = { ...out };
  band.forEach((t, i) => { out[t.id] = { ...t, priority: targetPriority, sortIndex: i }; });
  if (todo.priority !== targetPriority) {
    out = normalizeBand(out, todo.fortnightId, todo.scheduledDay, todo.priority);
  }
  return out;
}

/** Relative-order comparator for todos being moved by rollover/carry-over:
 *  earlier source day first, then manual order, then age. Compare on the
 *  ORIGINAL todos (before relocation). */
export function movedOrder(a: Todo, b: Todo): number {
  return a.scheduledDay.localeCompare(b.scheduledDay)
    || (a.sortIndex ?? UNRANKED) - (b.sortIndex ?? UNRANKED)
    || a.createdAt.localeCompare(b.createdAt);
}

/** Rollover/carry-over ordering policy (spec §2): `movedIds` — already
 *  relocated onto `day`, already in desired relative order (sort by
 *  `movedOrder` before relocating) — are appended AFTER each destination
 *  band's existing members, whose curated order is normalized but otherwise
 *  untouched. */
export function appendToDay(
  todos: Record<string, Todo>,
  movedIds: string[],
  fortnightId: string,
  day: ISODate,
): Record<string, Todo> {
  const movedSet = new Set(movedIds);
  const out = { ...todos };
  for (const priority of PRIORITIES) {
    const moved = movedIds.map((id) => out[id]).filter((t) => t.priority === priority);
    if (moved.length === 0) continue;
    const existing = bandMembers(out, fortnightId, day, priority)
      .filter((t) => !movedSet.has(t.id));
    existing.forEach((t, i) => { out[t.id] = { ...t, sortIndex: i }; });
    moved.forEach((t, i) => { out[t.id] = { ...t, sortIndex: existing.length + i }; });
  }
  return out;
}

export interface BandPosition { priority: Priority; index: number; size: number }

/** Where a pending todo currently sits in its band. Null for done/unknown. */
export function bandPosition(todos: Record<string, Todo>, id: string): BandPosition | null {
  const todo = todos[id];
  if (!todo || todo.done) return null;
  const band = bandMembers(todos, todo.fortnightId, todo.scheduledDay, todo.priority);
  return { priority: todo.priority, index: band.findIndex((t) => t.id === id), size: band.length };
}

/** Where one keyboard step lands (-1 = up, +1 = down): the neighbouring
 *  slot in the same band, or across the boundary into the adjacent
 *  priority (up: end of the previous band; down: start of the next).
 *  Null at the very top/bottom and for done/unknown ids. */
export function moveTarget(
  todos: Record<string, Todo>,
  id: string,
  direction: -1 | 1,
): { priority: Priority; index: number } | null {
  const pos = bandPosition(todos, id);
  if (!pos) return null;
  const next = pos.index + direction;
  if (next >= 0 && next < pos.size) return { priority: pos.priority, index: next };
  const bandIdx = PRIORITIES.indexOf(pos.priority) + direction;
  if (bandIdx < 0 || bandIdx >= PRIORITIES.length) return null;
  const targetPriority = PRIORITIES[bandIdx];
  if (direction === 1) return { priority: targetPriority, index: 0 };
  const todo = todos[id];
  const size = bandMembers(todos, todo.fortnightId, todo.scheduledDay, targetPriority).length;
  return { priority: targetPriority, index: size };
}
