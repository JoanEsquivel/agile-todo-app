import { useState } from 'react';
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
  if (!fn) return null;
  const day = state.selectedDay ?? fn.days[0];
  const readOnly = selectIsReadOnly(state);
  const todos = selectTodosForDay(state, fn.id, day);
  const notes = selectNotesForDay(state, fn.id, day);

  return (
    <div className={styles.column}>
      <h2 className={styles.heading}>{formatDayLabel(day)}</h2>
      <section className={styles.section} aria-label="Todos">
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionLabel}>Todos</h3>
          {!readOnly && !adding && (
            <button className={styles.addButton} onClick={() => setAdding(true)}>Add todo</button>
          )}
        </div>
        {adding && <TodoForm day={day} days={fn.days} onClose={() => setAdding(false)} />}
        {todos.length === 0
          ? <EmptyState message="No todos for this day" />
          : <ul className={styles.list}>{todos.map((t) => <TodoItem key={t.id} todo={t} readOnly={readOnly} />)}</ul>}
      </section>
      <section className={styles.section} aria-label="Notes">
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionLabel}>Notes</h3>
          {!readOnly && !addingNote && (
            <button className={styles.addButton} onClick={() => setAddingNote(true)}>Add note</button>
          )}
        </div>
        {addingNote && <NoteForm day={day} onClose={() => setAddingNote(false)} />}
        {notes.length === 0
          ? <EmptyState message="No notes for this day" />
          : <ul className={styles.list}>{notes.map((n) => <NoteCard key={n.id} note={n} readOnly={readOnly} />)}</ul>}
      </section>
    </div>
  );
}
