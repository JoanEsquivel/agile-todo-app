import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/store';
import { bandPosition } from '../domain/reorder';
import type { Priority, Todo } from '../domain/types';

export interface DragTarget { priority: Priority; index: number }

/** Hand-rolled pointer-events reorder for the day column's pending todos
 *  (spec §4). One instance per DayColumn; TodoItem receives handle props.
 *  Dragging holds NO store state — the drop commits via reorderTodo; a
 *  cancel (pointercancel, view change) discards everything. */
export function useDragReorder(pendingTodos: Todo[], viewKey: string) {
  const reorderTodo = useAppStore((s) => s.reorderTodo);
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DragTarget | null>(null);
  const startY = useRef(0);
  const items = useRef(new Map<string, HTMLElement>());
  const separators = useRef(new Map<Priority, HTMLElement>());
  // Mirrors `target` so onPointerMove can compare against the latest value
  // without depending on React state (which lags a render behind inside the
  // same closure) -- updateTarget is the single place that writes both, so
  // they can never diverge.
  const targetRef = useRef<DragTarget | null>(null);
  // Cleared on drop/cancel/view-change -- see the pointer-up ordering note
  // below for why clearing this (a plain DOM write, not React state) must
  // always happen BEFORE the store commit that triggers the next render.
  const draggedId = useRef<string | null>(null);

  const clearTransform = () => {
    const id = draggedId.current;
    if (id === null) return;
    const el = items.current.get(id);
    if (el) el.style.transform = '';
    draggedId.current = null;
  };

  const updateTarget = (next: DragTarget | null) => {
    targetRef.current = next;
    setTarget(next);
  };

  const sameTarget = (a: DragTarget | null, b: DragTarget) =>
    a !== null && a.priority === b.priority && a.index === b.index;

  // A view switch mid-drag must not commit onto the new view (spec §4).
  useEffect(() => {
    clearTransform();
    setDragId(null);
    updateTarget(null);
  }, [viewKey]);

  const registerItem = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) items.current.set(id, el);
    else items.current.delete(id);
  }, []);

  const registerSeparator = useCallback((p: Priority) => (el: HTMLElement | null) => {
    if (el) separators.current.set(p, el);
    else separators.current.delete(p);
  }, []);

  const computeTarget = (clientY: number, id: string): DragTarget => {
    const topOf = (p: Priority) => {
      const el = separators.current.get(p);
      return el ? el.getBoundingClientRect().top : Infinity;
    };
    const priority: Priority =
      clientY < topOf('medium') ? 'high' : clientY < topOf('low') ? 'medium' : 'low';
    let index = 0;
    for (const t of pendingTodos) {
      if (t.priority !== priority || t.id === id) continue;
      const el = items.current.get(t.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 < clientY) index += 1;
    }
    return { priority, index };
  };

  const getHandleProps = (todo: Todo): React.HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // jsdom (and old browsers) lack pointer capture — optional call.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      startY.current = e.clientY;
      draggedId.current = todo.id;
      setDragId(todo.id);
      const pos = bandPosition(useAppStore.getState().todos, todo.id);
      updateTarget(pos ? { priority: pos.priority, index: pos.index } : null);
    },
    onPointerMove: (e) => {
      if (dragId !== todo.id) return;
      const el = items.current.get(todo.id);
      if (el) el.style.transform = `translateY(${e.clientY - startY.current}px)`;
      const next = computeTarget(e.clientY, todo.id);
      if (!sameTarget(targetRef.current, next)) updateTarget(next);
    },
    onPointerUp: (e) => {
      if (dragId !== todo.id) return;
      const final = computeTarget(e.clientY, todo.id);
      // Clear the DOM transform BEFORE the store commit below: React reuses
      // the same keyed DOM node across the reorder, and `style` is no longer
      // a React-managed prop once we've written to it directly -- a residual
      // transform would leave the card visually offset in its new slot
      // forever if this happened after (or was skipped for) the render the
      // commit triggers.
      clearTransform();
      setDragId(null);
      updateTarget(null);
      reorderTodo(todo.id, final.priority, final.index);
    },
    onPointerCancel: () => {
      clearTransform();
      setDragId(null);
      updateTarget(null);
    },
  });

  return { dragId, target, getHandleProps, registerItem, registerSeparator };
}
