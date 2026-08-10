import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../../store/store';
import { selectIsReadOnly, selectNotesForDay, selectTodosForDay, selectViewedFortnight } from '../../store/selectors';
import { formatDayLabel } from '../../domain/dates';
import { EmptyState } from '../common/EmptyState';
import { TodoItem } from '../todos/TodoItem';
import { TodoForm } from '../todos/TodoForm';
import { NoteCard } from '../notes/NoteCard';
import { NoteForm } from '../notes/NoteForm';
import styles from './DayColumn.module.css';

export function DayColumn() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  const [adding, setAdding] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const addTodoButtonRef = useRef<HTMLButtonElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const todoFormId = useId();
  const noteFormId = useId();

  // Reset any open "add" form whenever the viewed fortnight changes (e.g. via
  // FortnightSwitcher, which is always enabled). This guarantees a form left
  // open while viewing the active fortnight cannot survive a switch to a
  // read-only past fortnight.
  useEffect(() => {
    setAdding(false);
    setAddingNote(false);
  }, [fn?.id]);

  if (!fn) return null;
  const day = state.selectedDay ?? fn.days[0];
  const readOnly = selectIsReadOnly(state);
  const todos = selectTodosForDay(state, fn.id, day);
  const notes = selectNotesForDay(state, fn.id, day);

  const closeTodoForm = () => {
    setAdding(false);
    addTodoButtonRef.current?.focus();
  };
  const closeNoteForm = () => {
    setAddingNote(false);
    addNoteButtonRef.current?.focus();
  };

  return (
    <div className={styles.column}>
      <h2 className={styles.heading}>{formatDayLabel(day)}</h2>
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
              onClick={() => setAdding((v) => !v)}
            >
              Add todo
            </button>
          )}
        </div>
        {!readOnly && adding && <TodoForm id={todoFormId} day={day} days={fn.days} onClose={closeTodoForm} />}
        {todos.length === 0
          ? <EmptyState message="No todos for this day" />
          : <ul className={styles.list}>{todos.map((t) => <TodoItem key={t.id} todo={t} readOnly={readOnly} />)}</ul>}
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
              onClick={() => setAddingNote((v) => !v)}
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
  );
}
