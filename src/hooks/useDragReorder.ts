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
  const [dragOffset, setDragOffset] = useState(0);
  const [target, setTarget] = useState<DragTarget | null>(null);
  const startY = useRef(0);
  const items = useRef(new Map<string, HTMLElement>());
  const separators = useRef(new Map<Priority, HTMLElement>());

  // A view switch mid-drag must not commit onto the new view (spec §4).
  useEffect(() => {
    setDragId(null);
    setTarget(null);
    setDragOffset(0);
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
      setDragId(todo.id);
      setDragOffset(0);
      const pos = bandPosition(useAppStore.getState().todos, todo.id);
      setTarget(pos ? { priority: pos.priority, index: pos.index } : null);
    },
    onPointerMove: (e) => {
      if (dragId !== todo.id) return;
      setDragOffset(e.clientY - startY.current);
      setTarget(computeTarget(e.clientY, todo.id));
    },
    onPointerUp: (e) => {
      if (dragId !== todo.id) return;
      const final = computeTarget(e.clientY, todo.id);
      setDragId(null);
      setTarget(null);
      setDragOffset(0);
      reorderTodo(todo.id, final.priority, final.index);
    },
    onPointerCancel: () => {
      setDragId(null);
      setTarget(null);
      setDragOffset(0);
    },
  });

  return { dragId, dragOffset, target, getHandleProps, registerItem, registerSeparator };
}
