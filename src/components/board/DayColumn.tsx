import { useEffect, useId, useRef } from 'react';
import { useAppStore } from '../../store/store';
import { selectIsReadOnly, selectNotesForDay, selectTodosForDay, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { useDragReorder } from '../../hooks/useDragReorder';
import { EmptyState } from '../common/EmptyState';
import { TodoItem } from '../todos/TodoItem';
import { TodoForm } from '../todos/TodoForm';
import { NoteCard } from '../notes/NoteCard';
import { NoteForm } from '../notes/NoteForm';
import styles from './DayColumn.module.css';

export function DayColumn() {
  const state = useAppStore();
  const setComposeIntent = useAppStore((s) => s.setComposeIntent);
  const fn = selectViewedFortnight(state);
  const adding = state.composeIntent === 'todo';
  const addingNote = state.composeIntent === 'note';
  const addTodoButtonRef = useRef<HTMLButtonElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const todoFormId = useId();
  const noteFormId = useId();

  // Belt-and-braces alongside viewFortnight's own explicit clear: an
  // automatic fortnight switch (rollover via checkDayTick, or
  // regenerateFortnight) changes `fn?.id` without going through
  // viewFortnight at all, and a form left open must not survive that either
  // — see INV-9 and the stale-open-form regression this guards against.
  useEffect(() => {
    setComposeIntent(null);
  }, [fn?.id, setComposeIntent]);

  const day = state.selectedDay ?? fn?.days[0] ?? null;
  const todos = fn && day ? selectTodosForDay(state, fn.id, day) : [];
  const pending = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const drag = useDragReorder(pending, `${fn?.id ?? ''}:${day ?? ''}`);
  if (!fn || !day) return null;
  const readOnly = selectIsReadOnly(state);
  const notes = selectNotesForDay(state, fn.id, day);

  const closeTodoForm = () => {
    setComposeIntent(null);
    addTodoButtonRef.current?.focus();
  };
  const closeNoteForm = () => {
    setComposeIntent(null);
    addNoteButtonRef.current?.focus();
  };

  // The day heading and the two sections are siblings, not parent/child --
  // see DayColumn.module.css for why: the heading is a plain grid item
  // pinned to row 1, and .column (the sections wrapper) subgrids only the
  // *column* axis, placed directly in row 2. An earlier version nested the
  // heading inside .column and subgridded both axes so .heading could
  // "fall into" row 1 by auto-placement; that made row 1's auto track size
  // a function of the subgrid's own internal row-gap distribution, which
  // could resolve a couple of pixels off from RemindersPanel's plain
  // (non-subgrid) row-2 placement -- a real, measured misalignment bug.
  // Splitting them into separate grid items removes that coupling: row 1's
  // height now depends only on the heading's own content, so both .column
  // and RemindersPanel start row 2 from the exact same computed line.
  return (
    <>
      <h2 className={styles.heading}>{formatDayLabel(day)}</h2>
      <div className={styles.column}>
        <section className={styles.section} aria-label="Todos">
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionLabel}>Todos</h3>
            {/* Stays mounted while the form is open — aria-expanded on a button
               that vanishes the moment it's "expanded" would be meaningless. */}
            {!readOnly && (
              <button
                ref={addTodoButtonRef}
                className={styles.addButton}
                aria-expanded={adding}
                aria-controls={todoFormId}
                onClick={() => setComposeIntent(adding ? null : 'todo')}
              >
                Add todo
              </button>
            )}
          </div>
          {!readOnly && adding && <TodoForm id={todoFormId} day={day} days={fn.days} onClose={closeTodoForm} />}
          {todos.length === 0
            ? <EmptyState message="No todos for this day" />
            : (
              <ul className={styles.list}>
                {(() => {
                  // Built as ONE flat array (not separate JSX expressions per
                  // band/done-section) so every TodoItem — pending or done —
                  // lives in the same reconciliation context. Splitting it
                  // into multiple top-level arrays let React treat a todo
                  // that flips to done (e.g. via its last checklist item) as
                  // moving out of one array and into another, which remounts
                  // the component and silently drops local state such as
                  // `checklistOpen` — a real regression caught by
                  // todos.test.tsx's "checking the last item" case.
                  const rows: React.ReactNode[] = [];
                  for (const priority of ['high', 'medium', 'low'] as const) {
                    const band = pending.filter((t) => t.priority === priority);
                    if (drag.dragId !== null) {
                      rows.push(
                        <li key={`sep-${priority}`} aria-hidden="true"
                            ref={drag.registerSeparator(priority)} className={styles.bandSeparator}>
                          {priority === 'high' ? 'High' : priority === 'medium' ? 'Medium' : 'Low'}
                        </li>,
                      );
                    }
                    // The indicator must be placed in the same index space
                    // `useDragReorder`'s computeTarget and domain reorderTodo
                    // use: the band EXCLUDING the dragged todo. `band` here
                    // (the render list) still INCLUDES it, so we track a
                    // separate counter that only advances past non-dragged
                    // items -- comparing drag.target.index against the raw
                    // array index `i` (full-band space) is the bug this
                    // replaced: it put the indicator one slot early on a
                    // downward drag and could double it at the band end.
                    let excludedIndex = 0;
                    band.forEach((t, i) => {
                      const isDragged = drag.dragId === t.id;
                      if (drag.dragId !== null && drag.target?.priority === priority
                          && !isDragged && drag.target.index === excludedIndex) {
                        rows.push(<li key={`ind-${priority}-${i}`} aria-hidden="true" className={styles.dropIndicator} />);
                      }
                      rows.push(
                        <TodoItem key={t.id} todo={t} readOnly={readOnly}
                          reorder={readOnly ? undefined : {
                            handleProps: drag.getHandleProps(t),
                            itemRef: drag.registerItem(t.id),
                            dragging: drag.dragId === t.id,
                            dragOffset: drag.dragOffset,
                          }} />,
                      );
                      if (!isDragged) excludedIndex += 1;
                    });
                    if (drag.dragId !== null && drag.target?.priority === priority
                        && drag.target.index === excludedIndex
                        && !(band.length === 1 && band[0].id === drag.dragId)) {
                      rows.push(<li key={`ind-${priority}-end`} aria-hidden="true" className={styles.dropIndicator} />);
                    }
                  }
                  doneTodos.forEach((t) => rows.push(<TodoItem key={t.id} todo={t} readOnly={readOnly} />));
                  return rows;
                })()}
              </ul>
            )}
        </section>
        <section className={styles.section} aria-label="Notes">
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionLabel}>Notes</h3>
            {!readOnly && (
              <button
                ref={addNoteButtonRef}
                className={styles.addButton}
                aria-expanded={addingNote}
                aria-controls={noteFormId}
                onClick={() => setComposeIntent(addingNote ? null : 'note')}
              >
                Add note
              </button>
            )}
          </div>
          {!readOnly && addingNote && <NoteForm id={noteFormId} day={day} onClose={closeNoteForm} />}
          {notes.length === 0
            ? <EmptyState message="No notes for this day" />
            : <ul className={styles.list}>{notes.map((n) => <NoteCard key={n.id} note={n} readOnly={readOnly} />)}</ul>}
        </section>
      </div>
    </>
  );
}
